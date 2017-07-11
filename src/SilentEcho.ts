import {IncomingMessage} from "http";
import * as https from "https";

export class SilentEcho {
    public baseURL: string;
    public constructor(public token: string) {
        this.baseURL = "https://silentecho.bespoken.io/process";
    }

    public message(message: string): Promise<ISilentResult> {
        const url = this.baseURL + "?message=" + message + "&user_id=" + this.token;

        const promise = new Promise<ISilentResult>((resolve, reject) => {
            const callback = (response: IncomingMessage) => {
                let data = "";

                response.on("data", (chunk) => {
                    data += chunk;
                });

                response.on("end", () => {
                    if (response.statusCode === 200) {
                        const result: ISilentResult = JSON.parse(data);
                        resolve(result);
                    } else {
                        reject(data);
                    }

                });
            };

            const request = https.get(url as any, callback);
            request.on("error", function(error: string) {
                reject(error);
            });

            request.end();
        });

        return promise;
    }
}

export interface ISilentResult {
    card: ICard | null;
    raw_json: any;
    transcript: string;
    transcript_audio_url: string;
    stream_url: string | null;
}

export interface ICard {
    imageURL: string | null;
    mainTitle: string | null;
    subTitle: string | null;
    textField: string;
    type: string;
}
