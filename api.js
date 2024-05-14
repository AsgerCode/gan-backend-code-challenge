const express = require('express');
const fs = require('fs-extra');
const addresses = require('./addresses.json');
const { getCoordinateDistanceInKm } = require('./util/math');

const app = express();
const protocol = 'http';
const host = '127.0.0.1';
const port = '8080';
const server = `${protocol}://${host}:${port}`;

app.listen(port, () => {
    console.log(`App listening on port ${port}`)
});

// our auth middleware will intercept requests and handle authentication
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        if (token === 'dGhlc2VjcmV0dG9rZW4=') {
            next();
        } else {
            res.status(401).send('Invalid token');
        }
    } else {
        res.status(401).send('No token provided');
    }
}

// applying the middleware
app.use(authMiddleware);

// endpoints
app.get("/cities-by-tag", (req, res) => {
    const tag = req.query.tag;
    // JSON parsing to cast string to boolean
    const isActive = JSON.parse(req.query.isActive);

    if (!tag) {
        res.status(400).send('Missing tag query parameter');
    } else {
        const results = addresses.filter((address) => address.tags.includes(tag) && address.isActive === isActive);
        res.status(200).send({ cities: results });
    }
});

app.get("/distance", (req, res) => {
    const { from, to } = req.query;

    if (!from || !to) {
        res.status(400).send('Missing from or to query parameters');
    } else {
        const fromAddress = addresses.find((address) => address.guid === from);
        const toAddress = addresses.find((address) => address.guid === to);

        const result = {
            from: fromAddress,
            to: toAddress,
            unit: "km",
            distance: getCoordinateDistanceInKm(fromAddress.latitude, fromAddress.longitude, toAddress.latitude, toAddress.longitude)
        };

        res.status(200).send(result);
    }
});

app.get("/area", async (req, res) => {
    const { from, distance } = req.query;

    // This code line is simply here to wipe all previous area results as it's not done on the testing script. This wouldn't make it into production
    fs.writeFileSync("./areaResults.json", "[]");

    if (!from || !distance) {
        res.status(400).send('Missing from or distance query parameters');
    } else {
        const fromAddress = addresses.find((address) => address.guid === from);
        const areaResults = JSON.parse(fs.readFileSync("./areaResults.json", "utf8"));
        areaResults.push({ id: "2152f96f-50c7-4d76-9e18-f7033bd14428", cities: [], status: "processing" });
        fs.writeFileSync("./areaResults.json", JSON.stringify(areaResults));
        res.status(202).send({ resultsUrl: `${server}/area-result/2152f96f-50c7-4d76-9e18-f7033bd14428` });

        for (const address of addresses) {
            if (address.guid !== from) {
                const distanceInKm = getCoordinateDistanceInKm(address.latitude, address.longitude, fromAddress.latitude, fromAddress.longitude);
                if (distanceInKm <= distance) {
                    areaResults.find(r => r.id === "2152f96f-50c7-4d76-9e18-f7033bd14428").cities.push(address);
                }
            }
        }

        areaResults.find(r => r.id === "2152f96f-50c7-4d76-9e18-f7033bd14428").status = "ready";
        fs.writeFileSync("./areaResults.json", JSON.stringify(areaResults));
    };
});

app.get("/area-result/:id", async (req, res) => {
    const id = req.params.id;

    if (!id) {
        res.status(400).send('Missing id query parameter');
    } else {
        const areaResults = require('./areaResults.json');
        const result = areaResults.find(r => r.id === id);

        if (result.status === "processing") {
            res.status(202).send("Results are still being processed");
        } else if (result.status === "ready") {
            res.status(200).send({ cities: result.cities });
        };
    };
});

app.get("/all-cities", (req, res) => {
        res.write('[');
        for (let i = 0; i < addresses.length; i++) {
            res.write(JSON.stringify(addresses[i]) + (addresses[i + 1] ? "," : ""));
        }
        res.write(']');
        res.status(200).end();
});