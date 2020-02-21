import { getConnectionOptions, createConnection } from 'typeorm'

Promise.resolve().then(async () => {
   const opt = await getConnectionOptions()
   console.warn('This file should not be used to create tables, use migrations instead!')
   await createConnection(Object.assign({}, opt, {
      synchronize: true,
      logging: true,
      logger: undefined
   }))
   process.exit(0)
}).catch((e) => {
   console.log(e)
   process.exit(-1)
})
