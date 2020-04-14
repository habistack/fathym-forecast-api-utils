let https = require('https')

function fail(context, message) {
  context.done(null, {
    status: 500,
    body: message
  })
}

module.exports = function(context, req) {
  let nowSec = Math.round((new Date).getTime() / 1000)
  let forecastAPIKey = req.query.forecastAPIKey
  let lat = parseFloat(req.query.lat)
  let lng = parseFloat(req.query.lng)

  context.log("SimplePoint request: lat="+lat+" lng="+lng)

  let sixHoursInSec = 60 * 60 * 6
  let pointData = []
  for(let i=0; i<8; i++) {
    pointData.push({lat: lat,
                    lng: lng,
                    "relative-seconds": Math.round(i * sixHoursInSec)})
  }

  let data = JSON.stringify({variables: [{"name":"Temperature","level":"Surface"}],
                             points: pointData})

  let options = {
    hostname: "fathym-forecast-int.azure-api.net",
    path: "/api/v0/point-query",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": data.length,
      "Ocp-Apim-Subscription-Key": forecastAPIKey
    }
  }

  let timeForecastStart = new Date
  let forecastAPIRequest = https.request(options, (res) => {
    let forecastAPIBody = ""
    res.on("data", (chunk) => { forecastAPIBody += chunk })
    res.on("end", () => {
      let forecastTimeMs = new Date - timeForecastStart
      let outData = []
      let forecastResponse = JSON.parse(forecastAPIBody)
      for( let i=0; i<forecastResponse[0].values.length; i++) {
        let t = (pointData[i]["relative-seconds"] + nowSec)
        outData.push({lat: lat,
                      lng: lng,
                      absoluteSeconds: t,
                      UTCString: (new Date(1000*t)).toISOString(),
                      surfaceTemperature: forecastResponse[0].values[i]})

      }

      context.log("SimplePoint request complete: forecastTimeMS=" + forecastTimeMs)

      // Final, successful, return
      context.done(null, {body: JSON.stringify(outData),
                          headers: {"Content-Type": "application/json",
                                    "Access-Control-Allow-Origin": "*"}})
    })
  })
  forecastAPIRequest.on("error", (error) => {
    console.error(error)
  })
  forecastAPIRequest.write(data)
  forecastAPIRequest.end()
}
