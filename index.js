const http = require('http')
const Stream = require('stream')

const { writeFileSync } = require('fs')
const { join } = require('path')
const { inherits } = require('util')

const _request = http.request
const _get = http.get
const empty = function() {}

class MockRequest {
    constructor() {
        this.headers = {}
    }
    setNoDelay () {}
    setHeader (name, value) {
        this.headers[name] = value
    }
    getHeader (name) {
        return this.headers[name]
    }
}
inherits(MockRequest, Stream)

function createRequest(options, callback, mock, context) {
    const request = new MockRequest()
    http.OutgoingMessage.call(request)
    Object.assign(request, mock.request)
    const socket = new MockRequest()
    const res = new http.IncomingMessage(socket)
    const { headers, statusCode, statusMessage, httpVersion, rawHeaders } = mock.response
    Object.assign(res, { headers, statusCode, statusMessage, httpVersion, rawHeaders })
    if (!context.request.body) context.request.body = []

    request.write = function(chunk) {
        context.request.body.push(chunk)
    }

    request.end = function(chunk) {
        if(chunk) context.request.body.push(chunk)
        context.request.rawHeaders = request._header
        if (options.validator) {
            try {
                options.validator(context, mock)
                setTimeout(() => {
                    if(callback) callback(res)
                    request.emit('response', res)
                    mock.response.body.forEach((chunk) => {
                        if (typeof chunk === 'string') {
                            res.emit('data', chunk)
                        } else {
                            res.emit('data', new Buffer(chunk.data))
                        }
                    })
                    res.emit('end')
                }, options.waitTime || 0)
            } catch (err) {
                console.error(err)
                if(callback) callback(err)
                request.emit('error', err)
            }
        }
    }
    request.writeHeaders = request.abort = request.flushHeaders = empty
    return request
}

module.exports = {
    reset: function(name, opts = {}) {
        if (!name) {
            http.get = _get;
            http.request = _request;
            return
        }
        let mocks = []
        let counter = 0
        const mockPath = join(opts.path || __dirname, `${name}.json`)
        if (!process.env.MOX_REFRESH) {
            try {
                mocks = require(mockPath)
            } catch(err) {}
        }
        http.get = http.request = function(options, callback) {
            const { path, method, headers, href, host, port, uri } = options
            const id = counter++
            const context = { id: id, request: { path, method, headers, body: [], href, host, port, uri } }
            if (context.request.host === '127.0.0.1' && context.request.path.match(/\/devtools\/*/)) {
                return _get(options)
            }
            const mock = mocks[id]
            if (mock) {
                return createRequest(opts, callback, mock, context)
            }
            const _req = _request(options, function(res) {
                const { statusCode, statusMessage, headers, httpVersion, rawHeaders } = res
                context.response = { statusCode, statusMessage, headers, httpVersion, rawHeaders, body: [] }
                res.on('data', chunk => context.response.body.push(chunk))
                res.on('end', () => {
                    context.request.rawHeaders = _req._header
                    mocks.push(context)
                    writeFileSync(mockPath, JSON.stringify(mocks))
                })
                if(callback) callback(res)
            })
            const _end = _req.end
            const _write = _req.write
            _req.write = function(chunk) {
                context.request.body.push(chunk)
                _write.apply(_req, Array.prototype.slice.call(arguments, 0))
            }
            _req.end = function(chunk) {
                if (chunk) context.request.body.push(chunk)
                _end.apply(_req, Array.prototype.slice.call(arguments, 0))
            }
            return _req
        }
    }
}