//backend for the after school lessons app
// uses node, express and mongodb atlas 
// most of this is based on what we did in labs 4, 5, 7, 8 and 9

var express = require("express");
var cors = require("cors");         // needed because the vue app is on github pages (different origin)
var path = require("path");         // for the path to the images folder

// load the mongodb details from config.env (lab 7.3)
require("dotenv").config({ path: "./config.env" });
const { MongoClient, ObjectId } = require("mongodb");

// put the connection string together from config.env so my password isnt in the code
const uri = process.env.MONGODB_PREFIX +
            process.env.MONGODB_USERNAME + ":" +
            process.env.MONGODB_PASSWORD +
            process.env.MONGODB_URL;
const client = new MongoClient(uri);
const db = client.db(process.env.MONGODB_DBNAME || "AfterSchool");

var app = express();

app.use(cors());           // allow any origin
app.use(express.json());   // so we can read the json body in POST and PUT

// logger middleware (lab 5.3)
// prints every request in the console, you can see it in the Render logs too
// e.g. 2026-11-17T13:20:05.123Z  PUT /lessons/6720ab...  body: {"space":3}
app.use(function(request, response, next) {
    var logLine = new Date().toISOString() + "  " + request.method + " " + request.url;
    if (request.method === "POST" || request.method === "PUT") {
        logLine += "  body: " + JSON.stringify(request.body);
    }
    console.log(logLine);
    next();
});

// static files middleware for the lesson images (lab 5.4)
// /images/maths.png gives back staticFiles/maths.png
// if the image doesnt exist the next app.use sends an error instead
var publicPath = path.resolve(__dirname, "staticFiles");
app.use("/images", express.static(publicPath));

// only gets here if express.static couldnt find the file
app.use("/images", function(request, response) {
    response.status(404).send("Image not found!");
});

//routes 

// just to check the server is up
app.get("/", function(request, response) {
    response.send("After-school lessons server is running. Try GET /lessons");
});

// GET /lessons - sends back all the lessons 
app.get("/lessons", async function(request, response) {
    try {
        let collection = await db.collection("lessons");
        let results = await collection.find({}).toArray();
        response.send(results);
    } catch (err) {
        console.log(err);
        response.status(500).send({ error: "Could not get lessons" });
    }
});

// POST /orders - saves the order in the orders collection 
// body looks like this:
// { "name": "Jane Smith", "phone": "07123456789", "lessonIDs": [1001, 1004], "spaces": [2, 1] }
// spaces[0] goes with lessonIDs[0], spaces[1] with lessonIDs[1] etc
app.post("/orders", async function(request, response) {
    var body = request.body;

    // make sure the order actually has everything before saving it
    if (!body.name || !body.phone || !Array.isArray(body.lessonIDs) || !Array.isArray(body.spaces)) {
        return response.status(400).send({ error: "Order needs name, phone, lessonIDs and spaces" });
    }

    try {
        let collection = await db.collection("orders");
        let result = await collection.insertOne(body);
        // sends back acknowledged and insertedId, the postman test uses this
        response.send(result);
    } catch (err) {
        console.log(err);
        response.status(500).send({ error: "Could not save order" });
    }
});

// PUT /lessons/:_id - can update any field of a lesson 
// whatever is in the body gets changed, e.g. { "space": 3 }
// using $set so it sets the value directly instead of just adding/taking 1
app.put("/lessons/:_id", async function(request, response) {
    try {
        let collection = await db.collection("lessons");
        let tempid = request.params._id;
        const query = { _id: new ObjectId(tempid) };
        const updates = {
            $set: request.body
        };
        let result = await collection.updateOne(query, updates);
        // matchedCount should be 1 if the id was right
        response.send(result);
    } catch (err) {
        console.log(err);
        response.status(400).send({ error: "Could not update lesson - check the id" });
    }
});

// GET /orders - all the orders, mainly so i can check them in postman
app.get("/orders", async function(request, response) {
    let collection = await db.collection("orders");
    let results = await collection.find({}).toArray();
    response.send(results);
});

// DELETE /orders/:id   postman uses this at the end to delete the test order
app.delete("/orders/:id", async function(request, response) {
    try {
        const query = { _id: new ObjectId(request.params.id) };
        const collection = db.collection("orders");
        let result = await collection.deleteOne(query);
        response.send(result);
    } catch (err) {
        console.log(err);
        response.status(400).send({ error: "Could not delete order - check the id" });
    }
});

//challenge tasks

// search challenge (done on the back end)
// GET /search?q=a finds lessons with "a" in topic, location, price or space
// price and space are numbers so i had to use $toString first, otherwise regex doesnt work on them
// option "i" makes it ignore upper/lower case
app.get("/search", async function(request, response) {
    let searchText = request.query.q || "";

    // escape special characters like . and + so they dont break the regex
    searchText = searchText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const query = {
        $expr: {
            $or: [
                { $regexMatch: { input: "$topic", regex: searchText, options: "i" } },
                { $regexMatch: { input: "$location", regex: searchText, options: "i" } },
                { $regexMatch: { input: { $toString: "$price" }, regex: searchText, options: "i" } },
                { $regexMatch: { input: { $toString: "$space" }, regex: searchText, options: "i" } }
            ]
        }
    };

    try {
        let collection = await db.collection("lessons");
        let results = await collection.find(query).toArray();
        response.send(results);
    } catch (err) {
        console.log(err);
        response.status(500).send({ error: "Search failed" });
    }
});

// teachers challenge
// teachers collection has firstName, lastName and lessonIDs (ids of the lessons they teach)

// GET /teachers - all teachers
app.get("/teachers", async function(request, response) {
    let collection = await db.collection("teachers");
    let results = await collection.find({}).toArray();
    response.send(results);
});

// GET /teachers/:_id/lessons - lessons for one teacher
app.get("/teachers/:_id/lessons", async function(request, response) {
    try {
        let teachers = await db.collection("teachers");
        let teacher = await teachers.findOne({ _id: new ObjectId(request.params._id) });
        if (!teacher) {
            return response.status(404).send({ error: "Teacher not found" });
        }
        // $in gets all lessons where the id is in the teachers lessonIDs
        let lessons = await db.collection("lessons");
        let results = await lessons.find({ id: { $in: teacher.lessonIDs } }).toArray();
        response.send(results);
    } catch (err) {
        console.log(err);
        response.status(400).send({ error: "Could not get lessons for this teacher" });
    }
});

// enrolment challenge
// GET /enrolment/1001 tells you how many spaces have been bought for lesson 1001
// goes through all the orders and adds up the spaces for that lesson
app.get("/enrolment/:lessonid", async function(request, response) {
    let lessonId = Number(request.params.lessonid);

    let collection = await db.collection("orders");
    // orders that have this lesson in lessonIDs
    let orders = await collection.find({ lessonIDs: lessonId }).toArray();

    let enrolment = 0;
    for (let order of orders) {
        let position = order.lessonIDs.indexOf(lessonId);
        enrolment += order.spaces[position];
    }

    response.send({ lessonID: lessonId, enrolment: enrolment });
});

// anything that didnt match a route above gets a 404 
app.use(function(request, response) {
    response.status(404).send("Page not found!");
});

// render gives the port in process.env.PORT, 3000 is for running it locally 
const port = process.env.PORT || 3000;
app.listen(port, function() {
    console.log("App started on port " + port);
});
