const http = require('http')
const Stream = require('stream')

const { writeFileSync } = require('fs')
const { join } = require('path')
const { inherits } = require('util')

const originalRequest = http.request
function empty() { }

class MockRequest {
	constructor() {
		this.headers = {}
		this.noDelay = false
	}
	setNoDelay(on) {
		this.noDelay = on
	}
	setHeader(name, value) {
		this.headers[name] = value
	}
	getHeader(name) {
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

	request.write = function socketWrite(chunk) {
		context.request.body.push(chunk)
	}

	function doCallback() {
		if (callback) callback(null, res)
		request.emit('response', res)
		mock.response.body.forEach(chunk => {
			if (typeof chunk === 'string') {
				res.emit('data', chunk)
			} else {
				res.emit('data', new Buffer(chunk.data))
			}
		})
		res.emit('end')
	}

	request.end = function requestEnd(chunk) {
		context.request.body.push(chunk)
		context.request.rawHeader = request._header // eslint-disable-line no-underscore-dangle
		if (options.validator) {
			try {
				options.validator(context, mock)
				setTimeout(() => doCallback, options.waitTime || 0)
			} catch (err) {
				if (callback) callback(err)
				request.emit('error', err)
			}
		}
	}

	request.writeHeaders = empty
	request.abort = empty
	return request
}

function reset(name, opts) {
	let mocks = []
	let counter = 0
	const mockPath = join(__dirname, `${name}.json`)
	if (!process.env.MOX_REFRESH) {
		try {
			mocks = require(mockPath) // eslint-disable-line global-require,import/no-dynamic-require
		} catch (err) {
			mocks = []
		}
	}
	http.request = (options, callback) => {
		const { path, method, href, host, port, uri } = options
		const id = counter++
		const context = { id, request: { path, method, body: [], href, host, port, uri } }
		const mock = mocks[id]
		if (mock) {
			return createRequest(opts, callback, mock, context)
		}
		const fakeRequest = originalRequest(options, res => {
			const { statusCode, statusMessage, headers, httpVersion, rawHeaders } = res
			context.response = { statusCode, statusMessage, headers, httpVersion, rawHeaders, body: [] }
			res.on('data', chunk => context.response.body.push(chunk))
			res.on('end', () => {
				context.request.rawHeader = fakeRequest._header // eslint-disable-line no-underscore-dangle
				mocks.push(context)
				writeFileSync(mockPath, JSON.stringify(mocks))
			})
			if (callback) callback(null, res)
		})
		const fakeEnd = fakeRequest.end
		const fakeWrite = fakeRequest.write
		fakeRequest.write = (...args) => {
			const chunk = args[0]
			context.request.body.push(chunk)
			fakeWrite.apply(fakeRequest, args)
		}
		fakeRequest.end = (...args) => {
			const chunk = args[0]
			context.request.body.push(chunk)
			fakeEnd.apply(fakeRequest, args)
		}
		return fakeRequest
	}
	http.get = http.request
}

module.exports = reset
