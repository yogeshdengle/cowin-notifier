# COWIN Appointment Notifier

This is a minimalist script that will keep hitting the cowin api's for appointment avaiablity for certain districts every 7 seconds and send out notifications based on availbality in certain "hardcoded" districts.



### How to Run:

#### Setup
Install a monitor/supervisor/process manager like forever or pm2.

Example: 
```npm install -g forever```

Checkout/clone the code.
Install all deps  using ```npm install```.

#### Creating config
The config file needs to be created and placed under ```resources/config.json```.
The contents of teh config file should be:
```
{
    "url": "https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/calendarByDistrict",
    "apiId" : "Your API ID for telegram",
    "apiHash" : "Your API Hash for telegram",
    "botToken" : "Your Bot token"
}

```
*Note*: See below for links to setting up telegram API and Bot.

#### Starting the app
Start the script ```forever start src/index.js```

This should start the app.
The logs are writting to console.

### Telegram
#### Getting the API Details
Use this link to get your API creds. https://core.telegram.org/api/obtaining_api_id

Use this link to create a bot. https://core.telegram.org/bots#creating-a-new-bot

Just create a new bot. Setup channels and add the bot as a Admin in those channels with permission to post messages.
Once done the code should be able to post messages in those channels.

## Next Steps:
1. Currently districts that need to be monitored need to be setup in the code as a separate method per district. This can be driven off the API's and/or config.
2. The channel names for districts are hard coded into the code along with district ids. These can be config driven.
3. The frequency of polling is hard coded in the code, needs to be moved to config.
4. The dont sent notifications per poll of the API logic needs further fine tuning. The idea here was that in some rural places the appointments might be open for a long time and we dont want to send users notifications every time the script pulls data. But we should still notify after sometime if they are still available particularly in cities etc. This needs fine tuning.
5. Error handling.
6. Improved logging using a logging framework. 