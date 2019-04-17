import { IncomingMessage } from "http";
import * as http from "http";
import * as https from "https";
import * as URL from "url";

export class VirtualDevice {
    public baseURL: string;
    public homophones: {[id: string]: string[]} = {};
    public constructor( public token: string,
                        public locale?: string,
                        public voiceID?: string,
                        public skipSTT?: boolean,
                        public asyncMode?: boolean,
                        public stt?: string,
                        public locationLat?: string,
                        public locationLong?: string,
                        ) {
        this.baseURL = process.env.VIRTUAL_DEVICE_BASE_URL
            ? process.env.VIRTUAL_DEVICE_BASE_URL
            : "https://virtual-device.bespoken.io";
    }

    public addHomophones(word: string, homophones: string[]) {
        homophones = homophones.map((s) => s.trim());
        this.homophones[word] = homophones;
    }

    public httpInterface(url: any): any {
        if (url.protocol === "https:") {
            return https;
        } else {
            return http;
        }
    }

    public httpInterfacePort(url: any): any {
        if (url.port) {
            return url.port;
        }
        if (url.protocol === "https:") {
            return 443;
        } else {
            return 80;
        }
    }

    public message(message: string, debug?: boolean,
                   phrases?: string[], newConversation?: boolean): Promise<IVirtualDeviceResult> {
        const encodedMessage = encodeURIComponent(message);
        let url = this.baseURL + "/process"
            + "?message=" + encodedMessage
            + "&user_id=" + this.token;

        if (phrases) {
            for (const phrase of phrases) {
                url += "&phrases=" + encodeURIComponent(phrase);
            }
        }

        if (debug) {
            url += "&debug=true";
        }

        if (newConversation) {
            url += "&new_conversation=true";
        }

        if (this.locale) {
            url += "&language_code=" + this.locale;
        }

        if (this.voiceID) {
            url += "&voice_id=" + this.voiceID;
        }

        if (this.skipSTT) {
            url += "&skip_stt=true";
        }

        if (this.stt) {
            url += "&stt=" + this.stt;
        }

        if (this.locationLat) {
            url += "&location_lat=" + this.locationLat;
        }

        if (this.locationLong) {
            url += "&location_long=" + this.locationLong;
        }

        url = encodeURI(url);
        const urlParsed = URL.parse(this.baseURL);
        return new Promise<IVirtualDeviceResult>((resolve, reject) => {
            const callback = (response: IncomingMessage) => {
                let data = "";

                response.on("data", (chunk) => {
                    data += chunk;
                });

                response.on("end", () => {
                    if (response.statusCode === 200) {
                        const result: IVirtualDeviceResult = JSON.parse(data);
                        result.message = message;
                        this.applyHomophones(result);
                        resolve(result);
                    } else {
                        reject(data);
                    }
                });
            };

            const request = this.httpInterface(urlParsed).get(url as any, callback);
            request.on("error", function(error: string) {
                reject(error);
            });

            request.end();
        });
    }

    public batchMessage(messages: IMessage[], debug?: boolean): Promise<IVirtualDeviceResult[] | any> {
        let path = "/batch_process?user_id=" + this.token;

        if (debug) {
            path += "&debug=true";
        }

        if (this.locale) {
            path += "&language_code=" + this.locale;
        }

        if (this.voiceID) {
            path += "&voice_id=" + this.voiceID;
        }

        if (this.skipSTT) {
            path += "&skip_stt=true";
        }

        if (this.asyncMode) {
            path += "&async_mode=true";
        }

        if (this.stt) {
            path += "&stt=" + this.stt;
        }

        if (this.locationLat) {
            path += "&location_lat=" + this.locationLat;
        }

        if (this.locationLong) {
            path += "&location_long=" + this.locationLong;
        }

        const url = URL.parse(this.baseURL);

        return new Promise<IVirtualDeviceResult[] | any>((resolve, reject) => {
            const callback = (response: IncomingMessage) => {
                let data = "";

                response.on("data", (chunk) => {
                    data += chunk;
                });

                response.on("end", () => {
                    if (response.statusCode === 200) {
                        if (this.asyncMode) {
                            resolve(this.handleAsynchResponse(data as string));
                        } else {
                            resolve(this.handleBatchResponse(data as string));
                        }
                    } else {
                        reject(data);
                    }
                });
            };

            const input = {
                messages,
            };
            const inputString = JSON.stringify(input);
            const requestOptions = {
                headers: {
                    "Content-Length": new Buffer(inputString).length,
                    "Content-Type": "application/json",
                },
                host: url.hostname,
                method: "POST",
                path,
                port: this.httpInterfacePort(url),
            };

            const request = this.httpInterface(url).request(requestOptions, callback);
            request.on("error", function(error: string) {
                reject(error);
            });

            request.write(inputString);
            request.end();
        });
    }

    public getConversationResults(uuid: string): Promise<IVirtualDeviceResult[] | any> {
        if (!this.asyncMode) {
            throw Error("Conversation Results only available in async mode");
        }

        const path = "/conversation?uuid=" + uuid;

        const url = URL.parse(this.baseURL);

        return new Promise<IVirtualDeviceResult[] | any>((resolve, reject) => {
            const callback = (response: IncomingMessage) => {
                let data = "";

                response.on("data", (chunk) => {
                    data += chunk;
                });

                response.on("end", () => {
                    if (response.statusCode === 200) {
                        const result = this.handleBatchResponse(data as string);
                        if ((result as IVirtualDeviceError).error) {
                            reject(new Error((result as IVirtualDeviceError).error));
                            return;
                        }

                        resolve(result);
                    } else {
                        reject(data);
                    }
                });
            };

            const requestOptions = {
                headers: {
                    "Content-Type": "application/json",
                },
                host: url.hostname,
                method: "GET",
                path,
                port: this.httpInterfacePort(url),
            };

            const request = this.httpInterface(url).request(requestOptions, callback);
            request.on("error", function(error: string) {
                reject(error);
            });

            request.end();
        });
    }

    public async waitForSessionToEnd() {
        const ms: number = process.env.SESSION_IDLE_MS
            ? parseInt(process.env.SESSION_IDLE_MS, 10)
            : 8000;
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private handleBatchResponse(data: string): IVirtualDeviceResult[] | IVirtualDeviceError {
        const json = JSON.parse(data);

        if (json && json.error) {
            return json as IVirtualDeviceError;
        }

        if (!json || !json.results) {
            return [];
        }
        for (const result of json.results) {
            this.applyHomophones(result);
        }
        return json.results;
    }

    private handleAsynchResponse(data: string): IConversationResult {
        return JSON.parse(data);
    }

    private applyHomophones(result: IVirtualDeviceResult) {
        if (!result.debug) {
            result.debug = {};
        }

        if (!result.transcript) {
            return;
        }

        const keys = Object.keys(this.homophones);
        result.debug.rawTranscript = result.transcript;

        for (const key of keys) {
            // Replace underscore with space - because we use environment variables to set these at times,
            //  underscores are needed
            const word = key.split("_").join(" ");

            const homophones = this.homophones[key];
            for (const homophone of homophones) {
                // Replace each of the homophones
                result.transcript = result.transcript.split(new RegExp("\\b" + homophone + "\\b")).join(word);
            }
        }
    }
}

export interface IConversationResult {
    conversation_id: string;
}

export interface IVirtualDeviceResult {
    card: ICard | null;
    debug: {
        rawTranscript?: string;
        rawJSON?: any;
    };
    sessionTimeout: number;
    streamURL: string | null;
    transcript: string | null;
    // message is the message used for this result.
    message: string;
}

export interface IVirtualDeviceError {
    error: string;
}

export interface ICard {
    imageURL: string | null;
    mainTitle: string | null;
    subTitle: string | null;
    textField: string | null;
    type: string;
}

export interface IMessage {
    text: string;
    phrases?: string[];
}
