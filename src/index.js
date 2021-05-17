const got = require('got');
const mysql = require('mysql2/promise');

const apiURL = process.env.URL;
const A45BotId = process.env.A45_BOT_ID;
const U45BotId = process.env.U45_BOT_ID;
const A45GroupId = process.env.A45_GROUP_ID;
const U45GroupId = process.env.U45_GROUP_ID;
const districtId = process.env.DISTRICT_ID;

let client;
let connection;
let isInited;




async function init() {
  try {
    console.log("Initing Lambda function");
    var initMySQL = process.env.MYSQL_INIT || 'true';
    initMySQL = (initMySQL == 'true');
    //Update connection parameters based on your connection string.
    if (initMySQL) {
      connection = await mysql.createConnection({
        host: process.env.MYSQL_HOST,
        port: process.env.MYSQL_PORT,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PSWD,
        database: process.env.MYSQL_DB
      });

      //you can use either prepared statements or direct queries, if multiple queries are reused all the time prefer prepared statements.
      //preparedEmpStatement = await connection.prepare("select * from employees where emp_no = ?");
      //preparedEmpInsertStatement = await connection.prepare("insert into employees values (?,?,?,?,?,?)");
      //preparedEmpUpdateStatement = await connection.prepare("update employees set gender=? where emp_no =?");
    }
    isInited = true;
  } catch (e) {
    console.log("Error while initing the lambda", e);
  }
}



function getTodaysDate() {
  const now = new Date();
  let month = now.getMonth() + 1;
  let date = now.getDate();
  let year = now.getFullYear();
  return ('0' + now.getDate()).slice(-2)+'-'+('0' + (now.getMonth()+1)).slice(-2)+'-'+now.getFullYear();
  //return date + "-" + month + "-" + year;
}

async function getDistrictData() {
  console.log("Getting data for District " + districtId);
  let searchParams = {
    "district_id":  districtId,
    "date" : getTodaysDate()
  }

  var hook =  {
		beforeRequest: [
			req => {
                //console.log(JSON.stringify(req));
			}
		]
	};
  let options = {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:88.0) Gecko/20100101 Firefox/88.0",
      //"User-Agent" : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1 Safari/605.1.15",
      "DNT": "1"
    },
    searchParams,
    http2 :true,
    responseType: 'json',
    hooks: hook
  };
  
  return  await got(apiURL, options);
}

function isDateGreaterThanEqualToToday(date) {
  const now = new Date();
  now.setHours(0, 0, 0, 0)
  const passedDate = new Date();
  passedDate.setHours(0,0,0,0);
  var fields = date.split('-');
  passedDate.setDate(Number.parseInt(fields[0]));
  passedDate.setFullYear(Number.parseInt(fields[2]));
  passedDate.setMonth(Number.parseInt(fields[1])-1);
  return passedDate >= now;
}

async function filterAvailableAndSendNotifications(data) {
  for (let center of data.centers) {
    for (let session of center.sessions) {
      if ((session.available_capacity_dose1 > 0 || session.available_capacity_dose2 > 0) 
          && isDateGreaterThanEqualToToday(session.date)){
        let slotData = createSlotData(center, session);
        await sendNotification(slotData);
        await postNotificationHandle(slotData);
      }
    }
  }
}

async function postNotificationHandle(slotData){
  //do your SQL magic here.
  return;
}

function createSlotData(center, session){
  let notificationData = {
    sessionId: session.session_id,
    centerId: center.center_id,
    state: center.state_name,
    dist: center.district_name,
    pin: center.pincode,
    name: center.name,
    blockName: center.block_name,
    date: session.date,
    freePaid: center.fee_type,
    foundAt: new Date().toLocaleString(),
    vaccine: session.vaccine,
    address: center.address,
    age : session.min_age_limit,
    totalCapacity : session.available_capacity,
    dose1Capacity : session.available_capacity_dose1,
    dose2Capacity : session.available_capacity_dose2
  }
  return notificationData;
}

async function sendNotification(slotData) {
  try {
    let message = `Age: ${slotData.age}+\nName: ${slotData.name} \n 
Address: ${slotData.address}
Block/Tal/Area: ${slotData.blockName}
PinCode: ${slotData.pin}
Date: ${slotData.date} 
Vaccine: ${slotData.vaccine}
Free/Paid: ${slotData.freePaid}

Total Capacity:  ${slotData.totalCapacity} 
Dose1 Capacity: ${slotData.dose1Capacity}
Dose2 Capacity: ${slotData.dose2Capacity}
\nRegistration Link: https://selfregistration.cowin.gov.in/`;
    if (slotData.age == 18 && U45GroupId){
        await sendMessage(message, U45GroupId, U45BotId);
    } else if (slotData.age == 45 && A45GroupId){
        await sendMessage(message, A45GroupId, A45BotId);
    }
  } catch (error) {
    console.log("Error while sending message", error);
  }
}

async function sendMessage(message, groupId, botId){
  if (!botId || !groupId){
    throw new Error("Bot or group Id is not set check config, message could not be sent.")
  }
  
  const req = "https://api.telegram.org/bot"+encodeURIComponent(botId)+"/sendMessage?chat_id="+encodeURIComponent(groupId)+"&text="+encodeURIComponent(message); 
  var response = await got(req);
  if (response.statusCode == 429){
    console.log("Getting too many reqeusts error from telegram api");
  }else if (response.statusCode != 200){
    throw new Error("Got error message from telegram api with status code "+response.statusCode);
  }
}


async function main(event) {
  try {
    if (!isInited) {
      init();
    }
    var districtResponseData = await getDistrictData();
    await filterAvailableAndSendNotifications(districtResponseData.body);
  } catch (e) {
    console.log(e);
  }
  return;
};

exports.handler=main;

//main({});
