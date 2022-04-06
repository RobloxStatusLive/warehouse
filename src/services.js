"use strict";

// Copyright 2022 iiPython

// Modules
const fs = require("fs");
const path = require("path");
const axios = require("axios").default;
const config = require("../config/config.json");

// Service handler class
class ServiceHandler {
    constructor(services) {
        this.services = services;
        this.dtf = new Intl.DateTimeFormat("en-US");

        // Initialize data directory
        if (!fs.existsSync(config["warehouse.dataLocation"])) fs.mkdirSync(config["warehouse.dataLocation"], { recursive: true });

        // Initialize axios
        this.ax = axios.create();
        this.ax.interceptors.request.use((c) => {
            c.headers.whReqSt = process.hrtime()
            return c
        });
        this.ax.interceptors.response.use((r) => {
            const end = process.hrtime(r.config.headers.whReqSt);
            r.headers.whReqElapsed = Math.round((end[0] * 1000) + (end[1] / 1000000));
            return r
        });
    }

    /**
     * Fetch the current date string
     */
    get now() { return this.dtf.format(new Date()).replace(/\//g, "-"); }

    /**
     * Saves current service data to the appropriate file
     */
    async dump(data) {
        let dateFile = path.resolve(config["warehouse.dataLocation"], `${this.now}.json`);
        let fileData = fs.existsSync(dateFile) ? JSON.parse(fs.readFileSync(dateFile)) : {};
        fileData[Date.now()] = data;
        fs.writeFile(dateFile, JSON.stringify(fileData), (e) => {
            if (e) return console.error(e);
            console.log(`[Warehouse] Service times have been recorded.`)
        });
    }

    /**
     * Fetches the latest service information
     */
    async fetch() {
        let dumpData = {};
        let responses = await Promise.all(this.services.map(v => {
            try {
                return this.ax.get(`https://${v.id}.roblox.com/${v.endpoint ?? ''}`);
            } catch (e) {
                console.log(`[Warehouse] Failed to record ${v.id} service: ${e.toString()}`);
            };
        }));
        for (let i = 0; i < responses.length; i++) dumpData[this.services[i].id] = {
            ping: responses[i].headers.whReqElapsed,
            machineID: responses[i].headers["roblox-machine-id"],
            url: `https://${this.services[i].id}.roblox.com`
        };
        this.dump(dumpData);
    }

    /**
     * Starts the warehouse main loop
     */
    mainloop() {
        setInterval(this.fetch, 60000);
        this.fetch();
    }
}

// Exports
module.exports = ServiceHandler;
