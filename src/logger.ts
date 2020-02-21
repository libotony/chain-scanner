export const log = (message: string) => {
    if (!message.endsWith('\n')) {
        message = message + '\n'
    }
    process.stdout.write(message)
}

export const error = (message: string) => {
    if (!message.endsWith('\n')) {
        message = message + '\n'
    }
    process.stderr.write(message)
}

export const taskTime = (from: Date) => {
    return (to: Date) => {
        return `From: [${from.getSeconds()}.${from.getMilliseconds}] To:[${to.getSeconds()}.${to.getMilliseconds}]`
    }
}
