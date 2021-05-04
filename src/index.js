const https = require('https');
const config = require('../resources/config.json');

const fs = require('fs');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const{ Logger } = require("telegram/extensions");
Logger.setLevel("error");

const apiURL = config.url;
const apiId = config.apiId;
const apiHash = config.apiHash;
const BotToken= config.botToken;
var client;
var notificationSentCenters= new Set();
var notificationSentOneHour = new Map();
var log = console.log;

console.log = function () {
    var first_parameter = arguments[0];
    var other_parameters = Array.prototype.slice.call(arguments, 1);

    function formatConsoleDate (date) {
        var hour = date.getHours();
        var minutes = date.getMinutes();
        var seconds = date.getSeconds();
        var milliseconds = date.getMilliseconds();

        return '[' +
               ((hour < 10) ? '0' + hour: hour) +
               ':' +
               ((minutes < 10) ? '0' + minutes: minutes) +
               ':' +
               ((seconds < 10) ? '0' + seconds: seconds) +
               '.' +
               ('00' + milliseconds).slice(-3) +
               '] ';
    }

    log.apply(console, [formatConsoleDate(new Date()) + first_parameter].concat(other_parameters));
};


function getTodaysDate(){
    const now = new Date();
    let month = now.getMonth()+1;
    let date = now.getDay();
    let year = now.getFullYear();
    return date+"-"+month+"-"+year;
}

async function getDistrictData(district_id){
    console.log("Getting data for District "+district_id);
    let url = new URL(apiURL);
    url.searchParams.set("district_id", district_id);
    url.searchParams.set("date", getTodaysDate());
    let options = {
        method : "GET",
        headers : {
            "Accept-Language" : "hl_IN",
            "User-Agent" : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:88.0) Gecko/20100101 Firefox/88.0",
            "Accept" : "application/json, text/plain, */*",
            "DNT" : "1",
            "Referer" : "https://www.cowin.gov.in/",
            "Cache-Control" : "no-cache"
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
          } catch(error){
            reject(error);
          }
        });
      });
  
      req.on('error', (err) => {
        reject(err);
      });
  
      if(data){
        req.write(data);
      }
      req.end();
    });
  }

function isDateGreaterThanEqualToToday(date){
  const now = new Date();
  now.setHours(0,0,0,0)
  const passedDate = new Date(date);
  let retVal = passedDate >= now;
  //console.log("passed date "+date.toLocaleString()+ " now date" + now.toLocaleString()+ " "+retVal);
  return passedDate >= now;
}

async function filter18PlusAvailable(data, groupName){
  
    for ( let center of data.centers){
        for (let session of center.sessions){
            
            // if (center.pincode == 411001){
            //   console.log(" min age"+session.min_age_limit+" avail cap"+session.available_capacity + " date"+ session.date+ " iscompare"+ isDateGreaterThanEqualToToday(session.date));
            // }
            if (center.pincode == 411001 && session.min_age_limit == 18 && session.available_capacity >= 0 && isDateGreaterThanEqualToToday(session.date)){
                let notificationData = {
                    sessionId : session.session_id,
                    state : center.state_name,
                    dist : center.district_name,
                    pin : center.pincode,
                    name : center.name,
                    blockName : center.block_name,
                    date : session.date,
                    slots : session.available_capacity,
                    freePaid : center.fee_type,
                    foundAt : new Date().toLocaleString(),
                    vaccine : session.vaccine,
                    address : center.address
                }
                console.log("notify");
                if (!notificationSentCenters.has(notificationData.sessionId) && (!notificationSentOneHour.get(notificationData.sessionId) || notificationSentOneHour.get(notificationData.sessionId) < 3)){
                  console.log("seding notify");
                  notificationSentCenters.add(notificationData.sessionId);
                  sendNotification(notificationData, groupName);
                }
                
            }
        }
    }
}

async function sendNotification(data, groupName) {
  try {
    let notificationString = `Found ${data.slots} open 18-44 slots at center "${data.name} -- ${data.blockName}" pin code is ${data.pin} for date ${data.date}. \nAvailable Vaccine is ${data.vaccine}. This is a ${data.freePaid} site.\nThis data is as of ${data.foundAt}. \n\nRegistration Link: https://selfregistration.cowin.gov.in/ \n\nThe API might be inconsistent, please reverify this against the Cowin website. `;

    console.log(notificationString);
    await client.sendMessage(groupName, { message: notificationString });

  } catch (error) {
    console.log("Error while sending message", error);
  }

}

async function createTelegramClient(){
  try{
    const stringSession = new StringSession('');
    client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });
    await client.start({
      botAuthToken: BotToken 
    });
  }catch(e){
    console.log("Error while sending message",e);
  }
}

async function getAndProcessDataForPune(){
  let response = await getDistrictData(363);
  //await filter18PlusAvailable(response, "U45Pune");
  await filter18PlusAvailable(response, "U45Test");
}

async function getAndProcessDataForAbad(){
  let response = await getDistrictData(397);
  await filter18PlusAvailable(response,"U45Aurangabad");
}

function clearLast10MinuteData(){
  let keys = notificationSentCenters.keys();
  notificationSentCenters.clear();
  for (let key of keys){
     if (notificationSentOneHour.has(key)){
       let count = notificationSentOneHour.get(key);
       count++;
       notificationSentOneHour.set(key, count);
     } else {
       notificationSentOneHour.set(key, 1);
     }
  }
}

function clearLast1Hr(){
  notificationSentOneHour.clear();
}

async function main(){

    await createTelegramClient();
    console.log("Created telegram client");
    let timerId = setInterval(getAndProcessDataForPune, 10000);
    //let timerId2 = setInterval(getAndProcessDataForAbad, 10000);
    let timerId3 = setInterval(clearLast10MinuteData, 600000);
    let timerId4 = setInterval(clearLast1Hr, 3600000);
    //console.log(JSON.stringify(response));
    //fs.writeFileSync("./response.json", JSON.stringify(response));

  }

main()