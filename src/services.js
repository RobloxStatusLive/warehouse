"use strict";

// Copyright 2022 iiPython

// Modules
const fs = require("fs");
const tar = require("tar-stream");
const path = require("path");
const zlib = require("zlib");
const axios = require("axios").default;
const { Readable } = require("stream");
const { Log } = require("@dmmdjs/dtools");
const config = require("../config/config.json");

// Logging intialization
let log = new Log("logs/latest.log");
let sendLog = (s) => { if (!(config["warehouse.disableLogging"] || false)) log.log(s); };

// Service handler class
class ServiceHandler {
    constructor(services) {
        this.services = services;
        this.dtf = new Intl.DateTimeFormat("en-US", { timeZone: "UTC" });

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

        // TarGZ Initialization
        this._readResult = null;
    }

    /**
     * Fetch the current date string
     */
    get now() { return this.dtf.format(new Date()).replace(/\//g, "-"); }

    /**
     * Turns a tgz file stream into a JSON-parsable string
     * @param {Stream} stream 
     * @returns promise
     */
    async streamConcat(stream) {
        const chunks = [];
        return new Promise((resolve, reject) => {
          stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          stream.on("error", (err) => reject(err));
          stream.on("end", () => resolve(Buffer.concat(chunks)));
        });
    }

    /**
     * Saves current service data to the appropriate file
     */
    async dump(data) {
        let dateFile = path.resolve(config["warehouse.dataLocation"], `${this.now}.tgz`);

        // Load existing data
        if (fs.existsSync(dateFile)) {
            let extract = tar.extract();
            extract.on("entry", async (header, stream, next) => {
                if (this._readResult) throw new Error("Another targz entry was detected, however we already got our result!");
                this._readResult = JSON.parse((await this.streamConcat(stream)).toString("UTF-8"));
                next();  // Should never do anything; if it does, we're in trouble.
            })
            let stream = Readable.from(zlib.gunzipSync(await this.streamConcat(fs.createReadStream(dateFile))));
            stream.pipe(extract);

            // Wait for our result
            var that = this;
            await (() => {
                function internalWait(resolve, reject) {
                    if (that._readResult) resolve();
                    else setTimeout(internalWait.bind(this, resolve, reject), 30);
                }
                return new Promise(internalWait);
            })();
            this._readResult[Date.now()] = data;
        } else this._readResult = { [Date.now()]: data };

        // Begin packing into a tar.gz file
        let pack = tar.pack();
        pack.entry({ name: `${this.now}.json` }, JSON.stringify(this._readResult));
        pack.finalize();
        fs.writeFile(dateFile, zlib.gzipSync(await this.streamConcat(pack)), (e) => {
            this._readResult = null;  // Save on our precious memory
            sendLog({ title: "WRITE", message: "Service times have been written to file." });
        });
    }

    /**
     * Fetches the latest service information
     */
    async fetch() {
        let dumpData = {};
        function parse(req, service) {

            // Calculate status
            let ping = req.headers.whReqElapsed,
                code = req.status,
                guess = { name: "up", reason: "No problems detected" },
                correct_code = service.code ?? 200;

            if (code !== correct_code) guess = { name: "down", reason: `Non-${correct_code} status code` }
            else if (ping > (service.threshold || 500) ) guess = { name: "down", reason: "Ping exceeds threshold" };

            // Save data
            return {
                id: service.id,
                url: `https://${service.id}.roblox.com`,
                code: code,
                ping: ping || 0,
                guess: guess,
                name: service.name,
                machineID: req.headers["roblox-machine-id"],
                message: req.statusText
            };
        }
        for (let service of this.services) {
            try {
                let req = await this.ax.get(`https://${service.id}.roblox.com`);
                dumpData[service.id] = parse(req, service);
            } catch (e) {
                if (!e.response || !e.response.status) {
                    sendLog({ title: "ERROR", message: `Failed to record ${service.id} service: ${e.toString()}` });
                    continue;
                }
                dumpData[service.id] = parse(e.response, service);
            };
        }
        this.dump(dumpData);
    }

    /**
     * Starts the warehouse main loop
     */
    mainloop() {
        sendLog({ title: "START", message: "Warehouse has been started." });
        setInterval(() => { this.fetch(); }, 60000);
        this.fetch();
    }
}

// Exports
module.exports = ServiceHandler;
