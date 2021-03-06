"use strict";

// Copyright 2022 iiPython

// Modules
const fs = require("fs");
const path = require("path");
const crypto = require('crypto');
const express = require("express");

const config = require("../config/config.json");

// Initialization
const app = express()
const dtf = new Intl.DateTimeFormat("en-US", { timeZone: "UTC" });

// Handler functions
function formatDate(d) {
    return dtf.format(d).replace(/\//g, "-");
}
function getPastWeek() {
    let week = {}, now = new Date();
    for (let i = 0; i < 5; i++) {
        let date = formatDate(new Date(now - (i * 86400000)));
        let fpath = path.resolve(config["warehouse.dataLocation"], `${date}.tgz`);
        if (fs.existsSync(fpath)) week[date] = crypto.createHash("md5").update(fs.readFileSync(fpath)).digest("hex");
    }
    return week;
}

// Routes
app.get("/sync/status", (req, res) => {
    return res.send(getPastWeek());
})
app.get("/sync/:date", (req, res) => {
    try {
        let date = formatDate(new Date(req.params.date));
        let fpath = path.resolve(config["warehouse.dataLocation"], `${date}.tgz`);
        if (!fs.existsSync(fpath)) return res.sendStatus(404);
        return res.send(fs.readFileSync(fpath));
    } catch {
        return res.sendStatus(400);
    }
})

// Start app
app.listen(process.env.PORT || config["warehouse.webServerPort"], () => {
    console.log(`[Warehouse]: Express server is running ...`);
})
