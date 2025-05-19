"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const restify = __importStar(require("restify"));
const listContainers_1 = require("./listContainers");
const server = restify.createServer();
server.use(restify.plugins.bodyParser());
server.listen(process.env.port || process.env.PORT || 3001, () => {
    console.log(`\nAPI server started, ${server.name} listening to ${server.url}`);
});
// add CORS support
server.pre((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.header('origin'));
    res.header('Access-Control-Allow-Headers', req.header('Access-Control-Request-Headers'));
    res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
        return res.send(204);
    }
    next();
});
server.get('/api/listContainers', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const response = yield (0, listContainers_1.listContainers)(req, res);
        res.send(200, response);
    }
    catch (error) {
        res.send(500, { message: `Error in API server: ${error.message}` });
    }
    next();
}));
