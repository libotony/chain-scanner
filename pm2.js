const pm2 = require('pm2')
const dotenv = require('dotenv')
const path = require('path')
const fs = require('fs')
const { promisify } = require('util')

const connect = promisify(pm2.connect.bind(pm2))
const describe = promisify(pm2.describe.bind(pm2))
const start = promisify(pm2.start.bind(pm2))
const stop = promisify(pm2.stop.bind(pm2))
const reload = promisify(pm2.reload.bind(pm2))

const exists = async (path) => {
    try {
        await fs.promises.access(path, fs.constants.F_OK)
        return true
    } catch (err) {
        return false
    }
}

const command = process.argv[2]
const network = process.argv[3]
const taskName = process.argv[4]

const printUsage = (msg = '') => {
    console.error(`${msg ? msg + '\n\n' : ''}Usage: node pm2.js [Command][Network][Task]
--------
Command:    [start|stop|reload|restart]
Network:    [main|test]
Task:       [foundation|tx-indexer|dual-token|token|authority|revert]`)
    process.exit(-1)
}

if (process.argv.length < 5) {
    printUsage()
    process.exit(-1)
}

if (network !== 'main' && network !== 'test') { 
    printUsage(`Unknown network: ${network}`)
}

if (['foundation', 'tx-indexer', 'dual-token', 'token', 'authority', 'revert'].indexOf(taskName) < 0) { 
    printUsage(`Unknown task: ${taskName}`)
}

const startTask = async (config) => {
    const desc = await describe(config.name)
    if (desc.length > 0 && desc[0].pm2_env.status === 'online') {
        return
    }
    await start(config)
}

const stopTask = async (name) => {
    const desc = await describe(name)
    if (desc.length > 0) {
        await stop(name)
    }
}

const reloadTask = async (name) => {
    const desc = await describe(name)
    if (desc.length > 0) {
        await reload(name)
    }
}

const getTokens = async (network) => {
    const { list } = require('./dist/tokens')
    const { Network } = require('./dist/const/network')

    let tokens = []
    if (network === 'main') {
        tokens = Object.keys(list[Network.MainNet])
    } else {
        tokens = Object.keys(list[Network.TestNet])
    }

    return tokens
}

void (async () => {
    const entryFile = 'dist/main/index.js'
    const envPath = path.join(__dirname, '.env')
    let envObj = {}
    if (await exists(envPath)) {
        const content = await fs.promises.readFile(envPath, 'utf8')
        envObj = dotenv.parse(content)
    }
    await connect()
    switch (command) {
        case 'start':
            if (taskName === 'token') {
                const tokens = await getTokens(network)
                for (const t of tokens) {
                    console.log(`start token-${t}`)
                    await startTask({
                        name: `token-${t}`,
                        script: entryFile,
                        args: [network, 'token', t],
                        log_date_format: "YYYY-MM-DD HH:mm:ss",
                        env: envObj
                    })
                }
            } else {
                await startTask({
                    name: taskName,
                    script: entryFile,
                    args: [network, taskName],
                    log_date_format: "YYYY-MM-DD HH:mm:ss",
                    env: envObj
                })
            }
            break
        case 'stop':
            if (taskName === 'token') {
                const tokens = await getTokens(network)
                for (const t of tokens) {
                    console.log(`stop token-${t}`)
                    await stopTask(`token-${t}`)
                }
            } else {
                await stopTask(taskName)
            }
            break
        case 'reload':
            if (taskName === 'token') {
                const tokens = await getTokens(network)
                for (const t of tokens) {
                    console.log(`reload token-${t}`)
                    await reloadTask(`token-${t}`)
                }
            } else {
                await reloadTask(taskName)
            }
            break
        default:
            printUsage(`Unknown command: ${command}`)
    }

    process.exit(0)
})().catch(err => {
    console.log('error')
    console.log(err)
    process.exit(-1)
})