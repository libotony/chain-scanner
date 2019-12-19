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
