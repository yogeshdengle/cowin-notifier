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
var notificationSentOneHour = new Map();
var log = console.log;

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
  let url = new URL(apiURL);
  url.searchParams.set("district_id", district_id);
  url.searchParams.set("date", getTodaysDate());
  let options = {
    method: "GET",
    headers: {
      "Accept-Language": "hl_IN",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:88.0) Gecko/20100101 Firefox/88.0",
      "Accept": "application/json, text/plain, */*",
      "DNT": "1",
      "Referer": "https://www.cowin.gov.in/",
      "Cache-Control": "no-cache",
      "Origin" : "",
      "Accept-Encoding": "gzip, deflate, br",
      "Pragma": "no-cache",
      "Accept-Language": "en-US,en;q=0.5"
    }

  }
  return await doRequest(url, options);
}



/**
 * Do a request with options provided.
 *
 * @param {Object} options
 * @param {Object} data
 * @return {Promise} a promise of request
 */
function doRequest(url, options, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      res.setEncoding('utf8');
      let responseBody = '';

      res.on('data', (chunk) => {
        responseBody += chunk;
      });

      res.on('end', () => {
        try {
          resolve(JSON.parse(responseBody));
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (data) {
      req.write(data);
    }
    req.end();
  });
}

function isDateGreaterThanEqualToToday(date) {
  const now = new Date();
  now.setHours(0, 0, 0, 0)
  const passedDate = new Date(date);
  return passedDate >= now;
}

async function filterAvailable(data, groupName, age, filterFunction) {
  if (typeof filterFunction !== 'function'){
      filterFunction = (session) => {
        return (session.min_age_limit == age && session.available_capacity > 0 );
      }
  }
  for (let center of data.centers) {
    for (let session of center.sessions) {
      if (filterFunction(center, session) && isDateGreaterThanEqualToToday(session.date)) {
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
        if (!notificationSentCenters.has(notificationData.sessionId)) {
          await sendNotification(notificationData, groupName, age);
          notificationSentCenters.add(notificationData.sessionId);
        }

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

async function getAndProcessDataForPune() {
  let response = await getDistrictData(363);
  //await filter18PlusAvailable(response, "U45Pune");
  await filterAvailable(response, "U45Pune", 18);
  await filterAvailable(response, "Above45PuneCity",45, (center, session) => {
    return ((''+center.pincode).startsWith("411") > 411000 && session.min_age_limit == 45 && session.available_capacity > 0);
  });
}

async function getAndProcessDataForAbad() {
  let response = await getDistrictData(397);
  await filterAvailable(response, "U45Aurangabad",18);
}


function clearLast10MinuteData() {
  notificationSentCenters.clear();
}


async function main() {

  await createTelegramClient();
  console.log("Created telegram client");
  let timerId = setInterval(getAndProcessDataForPune, 10000);
  let timerId2 = setInterval(getAndProcessDataForAbad, 10000);
  let timerId3 = setInterval(clearLast10MinuteData, 600000);
}

main()