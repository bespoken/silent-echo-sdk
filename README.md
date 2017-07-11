[![CircleCI](https://circleci.com/gh/bespoken/silent-echo-sdk.svg?style=svg)](https://circleci.com/gh/bespoken/silent-echo-sdk)
[![codecov](https://codecov.io/gh/bespoken/silent-echo-sdk/branch/master/graph/badge.svg)](https://codecov.io/gh/bespoken/silent-echo-sdk)

# Silent Echo SDK
Use the Silent Echo SDK to build UIs and bots that interact with Alexa via text.

Check out our first example project to use it - [SilentEchoBot](https://github.com/bespoken/silent-echo-bot)!  
Add SilentEcho to your Slack - [try it here](https://silentechobot.bespoken.io/slack_auth).

# Installation
Add the Silent Echo SDK to your project:  
```bash
npm install silent-echo-sdk --save
```
Get your token:  
[https://silentecho.bespoken.io/link_account?token=true](https://silentecho.bespoken.io/link_account?token=true)

Save the token that is generated - you will use it in the step below.

# Sending a Message
Here is a simple example in Javascript:
```javascript
const echoSDK = require("silent-echo-sdk");
const silentEcho = new echoSDK.SilentEcho("<PUT_YOUR_TOKEN_HERE>");
silentEcho.message(message).then((result) => {
    console.log("Reply Transcript: " + result.transcript);
    console.log("Reply Audio: " + result.transcript_audio_url);
});
```

Here is the full result payload:
```
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
```

# What's Next
* Keep the session open longer for deep skill interactions
* More bots. Lots of 'em.
