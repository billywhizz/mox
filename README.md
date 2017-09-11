## overview

a very simple (and stupid) module which allows capturing of test run http requests so they
can be replayed on future tests

http requests will be replayed in order they were originally created so if you change
order then you will need to regenerate the test data

## environment variables

```
MOX_REFRESH=1
```
Set this if you want to regenerate new test data

## install

```bash
$npm install --save-dev https://github.com/billywhizz/mox/archive/v0.1.3.tar.gz
```

## use in mocha spec

```javascript
const validator = require('./my.validator')

before(function() {
  // path: directory of where the mock data should be saved/read
	// validator: an optional function with this signature
	// function validator(context, mock) {
	// where context is the current http request and mock is the saved test
  require('mox').reset('name.of.my.test.suite', { validator, path: __dirname })
})
```

## validate requests against saved test data

```javascript
var should = require('should');
var expect = require('expect');
var sinon = require('sinon');

function validator(context, mock) {
    const current = context.request
    const test = mock.request
    current.should.have.properties(Object.keys(test))
    test.path.should.equal(current.path)
    test.method.should.equal(current.method)
    //test.host.should.equal(current.host)
    if (test.port) test.port.should.equal(current.port)
    if (test._header) test._header.should.equal(current._header)
    if (test.href) test.href.should.equal(current.href)
    //current.port.should.equal(test.port)
    if (test.headers) {
        current.headers.should.be.an.Object();
        Object.keys(test.headers).forEach(h => {
            test.headers[h].should.equal(current.headers[h])
        })
    }
    //if (test.body) test.body.should.equal(current.body)
		// specific tests for expected body here
}

module.exports = validator
```
