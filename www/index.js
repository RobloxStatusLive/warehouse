"use strict";

// Copyright 2022 iiPython

// Modules
const fs = require("fs");
const path = require("path");
const express = require("express");
const md5File = require("md5-file");

const config = require("../config/config.json");

// Initialization
const app = express()
const dtf = new Intl.DateTimeFormat("en-US");

// Handler functions
function getPastWeek() {
    let week = {}, now = new Date();
    for (let i = 0; i < 5; i++) {
        let date = dtf.format(new Date(now - (i * 86400000))).replace(/\//g, "-");
        let fpath = path.resolve(config["warehouse.dataLocation"], `${date}.json`);
        if (fs.existsSync(fpath)) week[date] = md5File.sync(fpath);
    }
    return week;
}

// Routes
app.get("/sync/status", (req, res) => {
    return res.send(getPastWeek());
})

// Start app
app.listen(config["warehouse.webServerPort"], () => {
    console.log(`[Warehouse]: Express server is running ...`);
})
