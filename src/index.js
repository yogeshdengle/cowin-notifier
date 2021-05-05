const https = require('https');
const config = require('../resources/config.json');
const got = require('got');

const fs = require('fs');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Logger } = require("telegram/extensions");
Logger.setLevel("error");

const apiURL = config.url;
const apiId = config.apiId;
const apiHash = config.apiHash;
const BotToken = config.botToken;
var client;
var notificationSentCenters = new Set();
var notificationsSentPerSessionPer24Hrs = new Map();
var log = console.log;
var responseCache = new Map();

console.log = function () {
  var first_parameter = arguments[0];
  var other_parameters = Array.prototype.slice.call(arguments, 1);

  function formatConsoleDate(date) {
    var hour = date.getHours();
    var minutes = date.getMinutes();
    var seconds = date.getSeconds();
    var milliseconds = date.getMilliseconds();

    return '[' +
      ((hour < 10) ? '0' + hour : hour) +
      ':' +
      ((minutes < 10) ? '0' + minutes : minutes) +
      ':' +
      ((seconds < 10) ? '0' + seconds : seconds) +
      '.' +
      ('00' + milliseconds).slice(-3) +
      '] ';
  }

  log.apply(console, [formatConsoleDate(new Date()) + first_parameter].concat(other_parameters));
};


function getTodaysDate() {
  const now = new Date();
  let month = now.getMonth() + 1;
  let date = now.getDay();
  let year = now.getFullYear();
  return date + "-" + month + "-" + year;
}

async function getDistrictData(district_id) {
  console.log("Getting data for District " + district_id);
  //let url = new URL(apiURL);
  let searchParams = {
    "district_id":  district_id,
    "date" : getTodaysDate()
  }

  let options = {
    method: "GET",
    headers: {
      "Accept-Language": "hl_IN",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:88.0) Gecko/20100101 Firefox/88.0",
      "DNT": "1",
      "Referer": "https://www.cowin.gov.in/",
      "Origin" : "https://www.cowin.gov.in/",
      "Accept-Language": "en-US,en;q=0.5"
    },
    searchParams,
    http2 :true,
    //cache : responseCache,
    responseType: 'json'
    
  }
  return  await got(apiURL, options);
}




function isDateGreaterThanEqualToToday(date) {
  const now = new Date();
  now.setHours(0, 0, 0, 0)
  const passedDate = new Date(date);
  return passedDate >= now;
}

async function filterAvailable(data, groupName, age, filterFunction) {
  if (typeof filterFunction !== 'function'){
      filterFunction = (center, session) => {
        return (session.min_age_limit == age && session.available_capacity > 0 );
      }
  }
  for (let center of data.centers) {
    for (let session of center.sessions) {
      if (filterFunction(center, session) && isDateGreaterThanEqualToToday(session.date) &&
      !notificationSentCenters.has(notificationData.sessionId) 
      && (!notificationsSentPerSessionPer24Hrs.get(notificationData.sessionId) 
          || notificationsSentPerSessionPer24Hrs.get(notificationData.sessionId) < 3)) {
        let notificationData = {
          sessionId: session.session_id,
          state: center.state_name,
          dist: center.district_name,
          pin: center.pincode,
          name: center.name,
          blockName: center.block_name,
          date: session.date,
          slots: session.available_capacity,
          freePaid: center.fee_type,
          foundAt: new Date().toLocaleString(),
          vaccine: session.vaccine,
          address: center.address
        }
        await sendNotification(notificationData, groupName, age);
        notificationSentCenters.add(notificationData.sessionId);
      }
    }
  }
}

async function sendNotification(data, groupName, age) {
  try {
    let notificationString = `Found ${data.slots} open ${age}+ slots at center "${data.name}" Address - "${data.address}" Block/Tal - "${data.blockName}" pin code is ${data.pin} for date ${data.date}. \nAvailable Vaccine is ${data.vaccine}. This is a ${data.freePaid} site.\nThis data is as of ${data.foundAt}. \n\nRegistration Link: https://selfregistration.cowin.gov.in/ \n\nThe API used to fetch data is sometimes inconsistent, please reverify this against the Cowin website.`;
    console.log(notificationString);
    await client.sendMessage(groupName, { message: notificationString });
  } catch (error) {
    console.log("Error while sending message", error);
  }

}

async function createTelegramClient() {
  try {
    const stringSession = new StringSession('');
    client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });
    await client.start({
      botAuthToken: BotToken
    });
  } catch (e) {
    console.log("Error while sending message", e);
  }
}

function shouldProcessResponse(response){
  return response.statusCode == 200;
}

async function getAndProcessDataForPune() {
  let response = await getDistrictData(363);
  if (shouldProcessResponse(response)) {
    //fs.writeFileSync("./response.json", JSON.stringify(response.body));
    //await filter18PlusAvailable(response, "U45Pune");
    await filterAvailable(response.body, "U45Pune", 18);
    await filterAvailable(response.body, "Above45PuneCity", 45, (center, session) => {
      return (('' + center.pincode).startsWith("411") > 411000 && session.min_age_limit == 45 && session.available_capacity > 0);
    });
  }
}

async function getAndProcessDataForNashik() {
  let response = await getDistrictData(389);
  if (shouldProcessResponse(response)){
    await filterAvailable(response.body, "U45Nashik",18);
  }
}

async function getAndProcessDataForNagar() {
  let response = await getDistrictData(391);
  if (shouldProcessResponse(response)){
    await filterAvailable(response.body, "U45Ahmednagar",18);
  }
}

async function getAndProcessDataForAbad() {
  let response = await getDistrictData(397);
  if (shouldProcessResponse(response)){
    await filterAvailable(response.body, "U45Aurangabad",18);
  }
}


function clearLast10MinuteData() {
  let keys = notificationSentCenters.keys();
  notificationSentCenters.clear();
  for (let sessionId of keys){
    if (notificationsSentPerSessionPer24Hrs.get(sessionId)){
      let count = notificationsSentPerSessionPer24Hrs.get(sessionId);
      count++;
      notificationsSentPerSessionPer24Hrs.set(key, count);
    } else {
      let count = 1;
      notificationsSentPerSessionPer24Hrs.set(key, count);
    }
  }

}

function clearLast24HourData(){
  notificationsSentPerSessionPer24Hrs.clear();
}


async function main() {

  await createTelegramClient();
  console.log("Created telegram client");
  setInterval(getAndProcessDataForPune, 7000);
  setInterval(getAndProcessDataForAbad, 7000);
  setInterval(getAndProcessDataForNashik, 7000);
  setInterval(getAndProcessDataForNagar, 7000);
  setInterval(clearLast10MinuteData, 600000);
  setInterval(clearLast24HourData, 86400000);
}

main()