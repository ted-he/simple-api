// I'm pretty sure these are basically imports
const express = require('express');
const mysql = require('mysql');
const url = require('url');
const auth = require('./auth.json');

// Replace API protocol with headers instead of body

const app = express();
app.use(express.json());

const PORT = auth.port;                    // Port used to get data remotely
const apiKey = auth["api-key"];              // Password used to get data remotely

// Initialize MySQL DB connection
var dbCon = mysql.createConnection({
    host: auth["db-host"],                 // Set server location (IP)
    user: auth["db-user"],                 // MySQL username
    password: auth["db-pass"],             // MySQL password
    database: "main",                      // MySQL database
    multipleStatements: true               // Allow multiple statements at the same time
});

// Attempt to connect to MySQL DB
dbCon.connect(function (err) {
    if (err) throw err;
    console.log("Connected to MySQL database.");
});

// Begin listening for requests on server
app.listen(
    PORT,
    () => console.log(`Server started on https://localhost:${PORT}`)
);

// Handle HTTP GET requests
app.get('/:table', (req, res) => {
    const { table } = req.params;
    const params = req.query;

    if (req.get('api-key') !== apiKey) {
        res.status(401).send({ message: 'Unauthorized.' });
    } else {
        var queryFilter = '';
        var keys = Object.keys(params);

        dbCon.query(`SELECT *
                    FROM INFORMATION_SCHEMA.TABLES
                    WHERE TABLE_TYPE = 'BASE TABLE'
                    AND TABLE_NAME = '${table}';`, function (err, result) {

            if (typeof result[0] === 'undefined') {
                res.status(404).send({ message: `Table '${table}' not found.` });
            } else {
                var values = Object.values(params);

                // Adds "filters" to DB query
                for (let i = 0; i < keys.length; i++) {
                    queryFilter += `\nAND ${keys[i]} = '${values[i]}'`;
                }

                dbCon.query(`SELECT *
                             FROM ${table}
                             WHERE id >= 0
                             ${queryFilter};`, function (err, result) {
                    if (err && err.sqlState == '42S22') res.status(404).send({ 'message': "Property not found." });
                    else if (err) throw err;
                    res.status(200).send(result);
                });
            }
        });
    }
});

app.get('/:table/:id', (req, res) => {
    const { table, id } = req.params;
    const { name } = req.body;

    if (!name) {
        res.status(400).send({ message: 'No file name provided.' });
    } else if (req.get('api-key') !== apiKey) {
        res.status(401).send({ message: 'Unauthorized.' });
    } else {
        // Query DB for requested data
        dbCon.query(`SELECT *
                     FROM ${table}
                     WHERE id = ${id};`, function (err, result) {
            if (err) throw err;

            if (result[0].id === null) {
                res.status(404).send({ message: 'File not found.' });
            } else if (result[0].name !== name) {
                res.status(400).send({ message: 'ID does not match filename.' });
            }

            // Send ID, name, and data back in JSON format
            res.status(200).send(result[0]);
        });
    }

});

// Handle HTTP POST requests
app.post('/:table', (req, res) => {
    const { table } = req.params;
    const { name, data, pass } = req.body;

    if (!name) {
        res.status(400).send({ message: 'No file name provided.' });
    } else if (!data) {
        res.status(400).send({ message: 'No file data provided.' });
    } else if (pass !== apiKey) {
        res.status(401).send({ message: 'Unauthorized.' });
    } else {
        // Query DB for current highest ID, lowest (previously) deleted ID, and any entries with the same name field
        dbCon.query(`SELECT MAX(id) AS max_id FROM ${table};
                     SELECT MIN(id) AS min_id FROM ${table}_del_id;
                     SELECT * FROM main WHERE name = '${name}';`, function (err, result) {
            if (err) throw err;

            // Get ID of data to be added
            var nextID = result[1][0].min_id == null ? result[0][0].max_id + 1 : result[1][0].min_id;

            // Check to ensure no duplicate names
            if (result[2].length != 0) {

                // Send 400 Bad Request error if name is taken
                res.status(400).send({ message: 'Name already taken.' });
            } else {
                // Add new entry to DB
                dbCon.query(`INSERT INTO ${table} (id, name, data)
                             VALUES (${nextID}, '${name}', '${data}');`, function (err, result) {
                    if (err) throw err;

                    res.status(200).send({ message: `File "${name}" was added with ID ${nextID} into ${table}.` });
                });
            }
        });
    }
});

// Handle HTTP DELETE requests
app.get('/:table/:id', (req, res) => {
    const { table, id } = req.params;
    const { name, pass } = req.body;

    if (!name) {
        res.status(400).send({ message: 'No file name provided.' });
    } else if (pass !== apiKey) {
        res.status(401).send({ message: 'Unauthorized.' });
    } else {
        // Query MySQL database for requested data
        dbCon.query(`SELECT *
                     FROM ${table}
                     WHERE id = ${id};`, function (err, result) {
            if (err) throw err;

            if (result[0].id == null) {
                res.status(404).send({ message: 'File not found.' });
            } else if (result[0].name !== name) {
                res.status(400).send({ message: 'ID does not match filename.' });
            } else {
                dbCon.query(`INSERT INTO ${table}_del_id (id) VALUES (${id}); \n
                             DELETE FROM ${table}
                             WHERE id = ${id};`, function (err, result) {
                    if (err) throw err;
                    res.status(400).send({ message: 'File deleted.' });
                });
            }
        });
    }
});

// Handle HTTP PATCH requests
app.patch('/:table/:id', (req, res) => {
    const { table, id } = req.params;
    const { name, data, pass } = req.body;

    if (!name) {
        res.status(400).send({ message: 'No file name provided.' });
    } else if (pass !== apiKey) {
        res.status(401).send({ message: 'Unauthorized.' });
    } else {
        dbCon.query(`UPDATE ${table}
                     SET data = '${data}'
                     WHERE id = ${id};`, function (err, result) {
            if (err) throw err;

            res.status(200).send({ message: 'File data updated.' });
        });
    }
});