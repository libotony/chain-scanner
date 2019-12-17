import * as https from 'https'
import * as http from 'http'
import * as querystring from 'querystring'

interface Params {
    query?: Record<string, string>
    body?: any
    headers?: Record<string, string>
    validateResponseHeader?: (headers: Record<string, string>) => void
}
type RequestFunc = (
    url: string,
    options: http.RequestOptions,
    callback?: (res: http.IncomingMessage) => void
) => http.ClientRequest

export class Net {
    private agent: http.Agent | https.Agent
    private request: RequestFunc

    constructor(
        readonly baseURL: string,
        readonly timeout = 15 * 1000
    ) {
        if (baseURL.startsWith('https://')) {
            this.agent = new https.Agent({
                keepAlive: true,
                maxSockets: 1000,
                maxFreeSockets: 50
            })
            this.request = https.request
        } else {
            this.agent = new http.Agent({
                keepAlive: true,
                maxSockets: 1000,
                maxFreeSockets: 50
            })
            this.request = http.request
        }
    }

    public async http<T>(
        method: 'GET' | 'POST',
        path: string,
        params?: Params
    ): Promise<T> {
        if (!params) {
            params = {}
        }

        const url = this.baseURL + '/' + path + (params.query ? ('?' + querystring.stringify(params.query)) : '')

        return new Promise((resolve, reject) => {
            const req = this.request(url, {
                method,
                headers: params!.headers || {},
                agent: this.agent,
                timeout: this.timeout
            }, (res) => {
                res.setEncoding('utf-8')

                if (params!.validateResponseHeader) {
                    try {
                        params!.validateResponseHeader(res.headers as Record<string, string>)
                    } catch (e) {
                        return reject(e)
                    }
                }

                let resStr = ''
                res.on('data', (data) => {
                    resStr += data
                })

                res.on('end', () => {
                    if (res.statusCode !== 200) {
                        reject(new Error(`${method} ${url} ${res.statusCode} - ${resStr}`))
                        return
                    }
                    try {
                        const ret = JSON.parse(resStr)
                        resolve(ret)
                    } catch (e) {
                        reject(e)
                    }
                })

            })

            req.on('error', e => {
                reject(e)
            })

            if (method === 'POST' && params!.body) {
                req.write(JSON.stringify(params!.body))
            }

            req.end()
        })

    }
}
