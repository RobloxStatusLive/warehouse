"use strict";

// Copyright 2022 iiPython

// Modules
const ServiceHandler = require("./src/services.js");
const ServiceList = require("./config/services.json");

// Start warehouse
const wh = new ServiceHandler(ServiceList);
wh.mainloop();
