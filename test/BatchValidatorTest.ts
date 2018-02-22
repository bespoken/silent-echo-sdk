import {assert} from "chai";
import * as dotenv from "dotenv";
import * as nock from "nock";
import * as Sinon from "sinon";

import {BatchValidator} from "../src/BatchValidator";
import {VirtualDevice} from "../src/VirtualDevice";
import {IVirtualDeviceTest,
    IVirtualDeviceValidatorResultItem,
    Validator,
    VirtualDeviceValidator,
    VirtualDeviceValidatorUnauthorizedMessage} from "../src/VirtualDeviceValidator";
import {MessageMock} from "./MessageMock";

describe("BatchValidator", function() {
    this.timeout(60000);
    const BASE_URL = "https://virtual-device.bespoken.io";
    const SOURCE_API_BASE_URL = process.env.SOURCE_API_BASE_URL;

    let token: string;
    const userID: string = "abc";

    before(() => {
        dotenv.config();
        if (process.env.TEST_TOKEN) {
            token = process.env.TEST_TOKEN as string;
        } else {
            assert.fail("No TEST_TOKEN defined");
        }

        MessageMock.enableIfConfigured();
    });

    after(() => {
        MessageMock.disable();
    });

    describe("#execute()", () => {
        let checkAuthStub: any;
        before(() => {
            checkAuthStub = Sinon.stub(VirtualDeviceValidator.prototype, "checkAuth")
                .returns(Promise.resolve("AUTHORIZED"));
        });
        after(() => {
            checkAuthStub.restore();
        });
        it("success", async () => {
            const sequences = [
                {
                    invocationName: "test player",
                    tests: [{
                        comparison: "contains",
                        expected: {
                            transcript: "welcome to the simple audio player",
                        },
                        input: "open test player",
                        sequence: 1,
                    },
                    {
                        comparison: "contains",
                        expected: {
                            streamURL: "https://feeds.soundcloud.com/stream/309340878-user-652822799-episode-010",
                        },
                        input: "tell test player to play",
                        sequence: 1,
                    }],
                },
            ];
            const virtualDeviceValidator = new BatchValidator(token, userID, BASE_URL);
            const validatorResult = await virtualDeviceValidator.execute(sequences);
            assert.equal(validatorResult.result, "success", `${JSON.stringify(validatorResult)}`);
            for (const test of validatorResult.tests) {
                assert.equal(test.result, "success", `${JSON.stringify(test)}`);
            }
        });

        it("failure", async () => {
            const sequences = [
                {
                    invocationName: "test player",
                    tests: [{
                        comparison: "contains",
                        expected: {
                            transcript: "wrong transcript",
                        },
                        input: "open test player",
                        sequence: 1,
                    }],
                },
            ];
            const virtualDeviceValidator = new BatchValidator(token, userID, BASE_URL);
            const validatorResult = await virtualDeviceValidator.execute(sequences);
            for (const test of validatorResult.tests) {
                assert.equal(test.result, "failure", `${JSON.stringify(test)}`);
                const error = (test.errors as any)[0];
                assert.equal(error.property, "transcript");
                assert.equal(error.expected, "wrong transcript");
                assert.include(error.actual, "simple audio player");
            }
        });

        it("has deep failure", async () => {
            const sequences = [
                {
                    invocationName: "test player",
                    tests: [{
                        comparison: "contains",
                        expected: {
                            card: {
                                mainTitle: "Wrong title",
                            },
                        },
                        input: "open test player",
                        sequence: 1,
                    }],
                },
            ];
            const virtualDeviceValidator = new BatchValidator(token, userID, BASE_URL);
            const validatorResult = await virtualDeviceValidator.execute(sequences);
            for (const test of validatorResult.tests) {
                assert.equal(test.result, "failure", `${JSON.stringify(test)}`);
                const error = (test.errors as any)[0];
                assert.equal(error.property, "card.mainTitle");
                assert.equal(error.expected, "Wrong title");
                assert.include(error.actual, "Title of the card");
            }
        });
    });

    describe("#execute() invocation permissions", () => {
        const sequences = [
            {
                invocationName: "test player",
                tests: [{
                    comparison: "contains",
                    expected: {
                        transcript: "welcome to the simple audio player",
                    },
                    input: "open test player",
                    sequence: 1,
                }],
            },
        ];
        let checkAuthStub: any;

        before(() => {
            checkAuthStub = Sinon.stub(VirtualDeviceValidator.prototype, "checkAuth")
                .throws("UNAUTHORIZED");
        });
        after(() => {
            checkAuthStub.restore();
        });

        it("handles #checkAuth() errors", async () => {
            const virtualDeviceValidator = new BatchValidator(token, userID, BASE_URL);
            try {
                await virtualDeviceValidator.execute(sequences);
                assert.fail("This should never be reached");
            } catch (err) {
                assert.equal(err, "UNAUTHORIZED");
            }
        });
    });

    describe("#execute() sequence processing failure", () => {
        const sequences = [
            {
                invocationName: "test player",
                tests: [{
                    comparison: "contains",
                    expectedStreamURL: undefined,
                    expectedTranscript: "welcome to the simple audio player",
                    input: "open test player",
                    sequence: 1,
                }],
            },
        ];
        let checkAuthStub: any;
        let seMessageStub: any;
        before(() => {
            MessageMock.enableIfConfigured();
            checkAuthStub = Sinon.stub(VirtualDeviceValidator.prototype, "checkAuth")
                .returns(Promise.resolve("AUTHORIZED"));
            seMessageStub = Sinon.stub(VirtualDevice.prototype, "batchMessage")
                .callsFake((message: string): Promise<any> => {
                    if (message.includes("Alexa") || message.includes("alexa quit")) {
                        return Promise.resolve();
                    }
                    return Promise.reject("something went wrong");
                });
        });
        after(() => {
            MessageMock.disable();
            seMessageStub.restore();
            checkAuthStub.restore();
        });
        it("handles virtual device errors", async () => {
            const virtualDeviceValidator = new BatchValidator(token, userID, BASE_URL);
            const validatorResult = await virtualDeviceValidator.execute(sequences);
            for (const test of validatorResult.tests) {
                assert.equal(test.result, "failure", `${JSON.stringify(test)}`);
                assert.equal(test.status, "done", `${JSON.stringify(test)}`);
            }
        });
    });

    describe("#checkAuth()", () => {
        beforeEach(() => {
            MessageMock.enable();
        });

        afterEach(() => {
            MessageMock.enable();
        });

        it("success", async () => {
            nock("https://source-api.bespoken.tools")
                .get("/v1/skillAuthorized?invocation_name=simple%20player" +
                    `&user_id=${userID}`)
                .reply(200, "AUTHORIZED");
            const virtualDeviceValidator = new BatchValidator(token, userID,
                BASE_URL, SOURCE_API_BASE_URL);
            const checkAuthResult = await virtualDeviceValidator.checkAuth("simple player");
            assert.equal(checkAuthResult, "AUTHORIZED");
        });
        it("handles replied errors", async () => {
            nock("https://source-api.bespoken.tools")
                .get("/v1/skillAuthorized?invocation_name=simple%20player" +
                    `&user_id=${userID}`)
                .reply(401, "UNAUTHORIZED");
            const virtualDeviceValidator = new BatchValidator(token, userID,
                BASE_URL, SOURCE_API_BASE_URL);
            try {
                await virtualDeviceValidator.checkAuth("simple player");
            } catch (err) {
                assert.equal(err,
                    VirtualDeviceValidatorUnauthorizedMessage("simple player"));
            }
        });
        it("handles request errors", async () => {
            nock("https://source-api.bespoken.tools")
                .get("/v1/skillAuthorized?invocation_name=simple%20player" +
                    `&user_id=${userID}`)
                .replyWithError("UNKNOWN ERROR");
            const virtualDeviceValidator = new BatchValidator(token, userID,
                BASE_URL, SOURCE_API_BASE_URL);
            try {
                await virtualDeviceValidator.checkAuth("simple player");
            } catch (err) {
                assert.equal(err, "UNKNOWN ERROR");
            }
        });
    });

    describe("Validator", () => {
        describe("#check()", () => {
            it("returns false if error is present", () => {
                const test: IVirtualDeviceTest = {
                    comparison: "contains",
                    input: "Hi",
                    sequence: 1,
                };
                const resultItem: IVirtualDeviceValidatorResultItem = {test};
                const validator = new Validator(resultItem, new Error("test error"));
                assert.isDefined(validator.check());
            });
            it("returns false if result item comparison is other than 'contains'", () => {
                const test: IVirtualDeviceTest = {
                    comparison: "includes",
                    input: "Hi",
                    sequence: 1,
                };
                const resultItem: IVirtualDeviceValidatorResultItem = {test};
                const validator = new Validator(resultItem, undefined);
                assert.isDefined(validator.check());
            });
        });
    });
});
