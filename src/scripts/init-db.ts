import { getConnectionOptions, createConnection } from 'typeorm'

Promise.resolve().then(async () => {
   const opt = await getConnectionOptions()
   createConnection(Object.assign({}, opt, {
      synchronize: true,
      logging: true,
      logger: undefined
   }))
}).catch(console.log)
