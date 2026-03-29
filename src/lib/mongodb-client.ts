// client for NextAuth.js
import { MongoClient } from "mongodb";

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function createClientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    // Return a rejected promise instead of throwing synchronously so that
    // Next.js module evaluation at build time doesn't crash (MONGODB_URI is
    // a runtime secret on Railway and is not present during `next build`).
    return Promise.reject(new Error("MONGODB_URI is not defined"));
  }
  return new MongoClient(uri).connect();
}

let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === "development") {
  if (!global._mongoClientPromise) {
    global._mongoClientPromise = createClientPromise();
  }
  clientPromise = global._mongoClientPromise;
} else {
  clientPromise = createClientPromise();
}

// Suppress unhandled-rejection warnings during build when URI is absent
clientPromise.catch(() => {});

export default clientPromise;
