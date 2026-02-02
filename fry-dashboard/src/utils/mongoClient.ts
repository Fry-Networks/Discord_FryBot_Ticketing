import { MongoClient, type MongoClientOptions } from 'mongodb'

// Reason: centralize TLS/CA handling for Mongo connections to avoid per-route drift.
export function buildMongoClient(mongoUri: string) {
  const options: MongoClientOptions = {}
  const mongoCaPath = process.env.MONGO_CA_CERT_PATH

  if (mongoCaPath) {
    options.tls = true
    options.tlsCAFile = mongoCaPath
  }

  return new MongoClient(mongoUri, options)
}
