// test.js - just checks config.env is right and that it connects to mongodb atlas 
// run  with: node test.js
require("dotenv").config({ path: "./config.env" });
const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_PREFIX + process.env.MONGODB_USERNAME + ":" +
            process.env.MONGODB_PASSWORD + process.env.MONGODB_URL;
const client = new MongoClient(uri);

async function connectToMongoDB() {
    try {
        await client.connect();
        console.log("You successfully connected to MongoDB!");
        return client;
    } catch (err) {
        console.dir(err);
    } finally {
        await client.close();
    }
}

connectToMongoDB();
