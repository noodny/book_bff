var express = require('express');
var request = require('good-guy-http')({
    maxRetries: 3,                     // how many times to retry failed requests
    collapseIdenticalRequests: true,   // should an identical request be collapsed into an ongoing one?
    errorLogger: console.error,        // error logging function - a failing cache doesn't break requests, but logs here

    defaultCaching: {                  // default caching settings for responses without Cache-Control
        cached: true,                    // - whether such responses should be cached at all
        timeToLive: 5000,                // - for how many ms
        mustRevalidate: false            // - is it OK to return a stale response and fetch in the background?
    },                                // you can set 'circuitBreaking: false' to turn this off

    circuitBreaking: {                 // circuit breaking - if more than errorThreshold percent of requests fail
        errorThreshold: 50               // good-guy stops sending them and periodically checks if the situation improves
    }
});
var jp = require('jsonpath');
var router = express.Router();
var ESI = require('nodesi');

function getBooksServiceUrl(isbn) {
    return 'https://book-catalog-proxy.herokuapp.com/book?isbn=' + isbn;
}

/* GET users listing. */
router.get('/:isbn', function(req, res, next) {
    var isbn = req.params.isbn;

    request(getBooksServiceUrl(isbn))
        .then(function(response) {
            try {
                var json = JSON.parse(response.body);
            } catch (e) {
                return next(new Error('Could not parse books service response.'));
            }

            if(jp.query(json, '$..title').length) {
                var book = {
                    title: jp.query(json, '$..title'),
                    thumbnail: jp.query(json, '$..thumbnail'),
                    isbn: isbn
                };

                return new Promise(function(resolve, reject) {
                    req.app.render('book', {book: book, partials: {layout: 'layout'}}, function(err, html) {
                        if(err) {
                            return reject(err);
                        }
                        resolve(html);
                    });
                });
            } else {
                return next();
            }
        })
        .then(function(html) {
            return new ESI({
                onError: function(src, error) {
                    if(error.statusCode === 404) {
                        return '<!-- ' + src + ' esi not found -->';
                    }
                    return '';
                }
            }).process(html);
        })
        .then(function(html) {
            return res.send(html);
        })
        .catch(function(err) {
            next(err);
        });
});

module.exports = router;
