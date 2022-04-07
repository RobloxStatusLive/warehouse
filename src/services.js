"use strict";

// Copyright 2022 iiPython

// Modules
const fs = require("fs");
const path = require("path");
const axios = require("axios").default;
const { Log } = require("@dmmdjs/dtools");
const config = require("../config/config.json");

// Logging intialization
let log = new Log("logs/latest.log");

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
        let fileData = {};
        try { fileData = fs.existsSync(dateFile) ? JSON.parse(fs.readFileSync(dateFile)) : {}; } catch {}
        fileData[Date.now()] = data;
        fs.writeFile(dateFile, JSON.stringify(fileData), (e) => {
            if (e) return console.error(e);
            log.log({ title: "WRITE", message: "Service times have been written to file." });
        });
    }

    /**
     * Fetches the latest service information
     */
    async fetch() {
        let dumpData = {};
        for (let service of this.services) {
            try {
                let req = await this.ax.get(`https://${service.id}.roblox.com/${service.endpoint ?? ''}`);

                // Calculate status
                let ping = req.headers.whReqElapsed,
                    code = req.status,
                    guess = { name: "up", reason: "No problems detected" };

                if (code !== 200) guess = { name: "down", reason: "Non-200 status code" }
                else if (ping > (service.threshold || 500) ) guess = { name: "down", reason: "Ping exceeds threshold" };

                // Save data
                dumpData[service.id] = {
                    id: service.id,
                    url: `https://${service.id}.roblox.com`,
                    code: code,
                    ping: ping,
                    guess: guess,
                    name: service.name,
                    machineID: req.headers["roblox-machine-id"],
                    message: req.statusText
                };
            } catch (e) { log.log({ title: "ERROR", message: `Failed to record ${service.id} service: ${e.toString()}` }); };
        }
        this.dump(dumpData);
    }

    /**
     * Starts the warehouse main loop
     */
    mainloop() {
        log.log({ title: "START", message: "Warehouse has been started." });
        setInterval(() => { this.fetch(); }, 60000);
        this.fetch();
    }
}

// Exports
module.exports = ServiceHandler;
