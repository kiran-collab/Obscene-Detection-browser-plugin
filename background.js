
browser.runtime.onMessage.addListener(async (msg, sender) => {
  console.log("BG page received message", msg, "from", sender);
  console.log("Stored data", await browser.storage.local.get());
});

statusInitialize();			//session initialize 

let BK_connectedClients = {};
let BK_connectedClientList = []; //gives the lsit of connected clients
let BK_openFilters = {};
let BK_openB64Filters = {};		
let BK_openVidFilters = {};

let BK_isInitialized = false;
function bkInitialize() {
    statusOnLoaded(); 		//current status of all images loaded
    bkUpdateFromSettings();
    bkSetEnabled(true); //always start on
}

function bkOnClientConnected(port) {
    console.log('LIFECYCLE: Processor '+port.name+' connected.');		//processor module called
    let registration = { port: port, processorId: port.name, isBusy: false, backend: 'unknown' };
    BK_connectedClients[registration.processorId] = registration;
    BK_connectedClientList.push(registration);
    console.log('LIFECYCLE: There are now '+BK_connectedClientList.length+' processors'); //gives the no. of image connections to be tested
    port.onMessage.addListener(bkOnProcessorMessage);//listen to the msg from processor
    bkNotifyThreshold();
    if(!BK_isInitialized) {
        BK_isInitialized = true;
        bkInitialize();						//if bckprocess not started, set to true
    }
}

let BK_currentProcessorIndex = 0;			//start img proc frm 0
function bkGetNextProcessor() {
    if(BK_connectedClientList.length == 0) {			//if current imgs 0 return null
        return null;
    }
    BK_currentProcessorIndex = (BK_currentProcessorIndex+1) % BK_connectedClientList.length;
    let preferredProcessor = BK_connectedClientList[BK_currentProcessorIndex];
    if (preferredProcessor.isBusy) {
        //if free return next one.
        for(let i=1; i<BK_connectedClientList.length; i++) {
            let pIndex = (BK_currentProcessorIndex+i) % BK_connectedClientList.length;
            let processor = BK_connectedClientList[pIndex];
            if(!processor.isBusy) {
                console.debug('PERF: Choosing free processor '+processor.processorId);
                return processor;
            }
        }
        //Are any WebGL? If so, return next one.
        for(let i=1; i<BK_connectedClientList.length; i++) {
            let pIndex = (BK_currentProcessorIndex+i) % BK_connectedClientList.length;
            let processor = BK_connectedClientList[pIndex];
            if(processor.backend == 'webgl') {
                console.info('PERF: Choosing webgl processor '+processor.processorId);
                return processor;
            }
        }
    }
    console.info('PERF: Choosing free/fallback processor '+preferredProcessor.processorId+' with status '+(preferredProcessor.isBusy ? 'busy' : 'free'));
    return preferredProcessor;
}

function bkBroadcastMessageToProcessors(m) {
    BK_connectedClientList.forEach(c=>{
        c.port.postMessage(m);					//msg to proc
    });
}
      
browser.runtime.onConnect.addListener(bkOnClientConnected); //listen when client connected
browser.tabs.create({url:'/processor.html?backend=default&id=webgl-1', active: false})
    .then(async tab=>await browser.tabs.hide(tab.id)); 		// creates webg1-1 file at the backend


function bkOnProcessorMessage(m) {
    switch(m.type) {
        case 'scan': {
            console.debug('PROC: '+m);
            let filter = BK_openFilters[m.requestId];
            filter.write(m.imageBytes);							//create a filter and write img
            filter.close();
            delete BK_openFilters[m.requestId];
            console.debug('OPEN FILTERS: '+Object.keys(BK_openFilters).length);
        }
        break;
        case 'b64_data': {
            let b64Filter = BK_openB64Filters[m.requestId];				//data in b64 format
            let b64Text = b64Filter.encoder.encode(m.dataStr);
            b64Filter.filter.write(b64Text);
        }
        break;
        case 'b64_close': {
            let b64Filter = BK_openB64Filters[m.requestId];
            b64Filter.filter.close();
            delete BK_openB64Filters[m.requestId];
        }
        break;
        case 'vid_scan': {
            vidOnVidScan(m);
        }
        break;
        case 'stat': {
            console.debug('STAT: '+m.requestId+' '+m.result);
            statusCompleteImageCheck(m.requestId, m.result);
            switch(m.result) {
                case 'pass': {
                    bkIncrementPassCount();
                }														//case of status
                break;
                case 'block': {
                    bkIncrementBlockCount();
                }
                //could also be tiny or error
            }
        }
        break;
        case 'registration': {
            console.dir(BK_connectedClients);
            console.log('LIFECYLE: Registration '+m.processorId);			//connect wtih client
            BK_connectedClients[m.processorId].backend = m.backend;
        }
        break;
        case 'qos': {
            console.debug('QOS: '+m.processorId+' isBusy: '+m.isBusy);
            BK_connectedClients[m.processorId].isBusy = m.isBusy;
        }
        break;
    }
}

var BK_isZoneAutomatic = true;
var BK_predictionBufferBlockCount = 0;		// gives the no. of blocked images
var BK_predictionBuffer = [];				//this is the predictions list 
var BK_estimatedTruePositivePercentage = 0;	// true positive as of now set to 0
var BK_isEstimateValid = false;

function bkAddToPredictionBuffer(prediction)		//addn. to prediction list takes place
{
    BK_predictionBuffer.push(prediction);			//prediction is pushed into the list
    if(prediction>0) {
        BK_predictionBufferBlockCount++;			//prediction list block counter incremented
    }
    if(BK_predictionBuffer.length>200) {			//if length of list is more than 200 then shift to var old predictions
        let oldPrediction = BK_predictionBuffer.shift();
        if(oldPrediction > 0) {
            BK_predictionBufferBlockCount--;
        }
    }
    if(BK_predictionBuffer.length>50) {			//if list length more than 50
        let estimatedTruePositiveCount = BK_zonePrecision*BK_predictionBufferBlockCount;
        BK_estimatedTruePositivePercentage = estimatedTruePositiveCount / BK_predictionBuffer.length;//pc true positive
        BK_isEstimateValid = true;
    } else {
        BK_estimatedTruePositivePercentage = 0;
        BK_isEstimateValid = false;
    }
}

function bkClearPredictionBuffer() {
    BK_predictionBufferBlockCount = 0;			//this clears the predictions list
    BK_predictionBuffer = [];
    BK_estimatedTruePositivePercentage = 0;		//and puts the blocked to 0
}

function bkIncrementBlockCount() {
    bkAddToPredictionBuffer(1);    //prediction buffer adds 1 if block count increases
    bkCheckZone();
}

function bkIncrementPassCount() {				//img if passed is incremented in buffer
    bkAddToPredictionBuffer(0);
    bkCheckZone();
}

function bkSetZoneAutomatic(isAutomatic) {
    BK_isZoneAutomatic = isAutomatic;			//set automaticzone if selected
}

function bkCheckZone()
{
    if(!BK_isEstimateValid) {
        return;
    }
    if(!BK_isZoneAutomatic) {
        return;
    }
    let requestedZone = 'untrusted';						//*****//
    if(BK_estimatedTruePositivePercentage < ROC_trustedToNeutralPercentage) {
        requestedZone = 'trusted';
    } else if(BK_estimatedTruePositivePercentage < ROC_neutralToUntrustedPercentage) {
        requestedZone = 'neutral';
    }
    if(requestedZone != BK_zone) {
        bkSetZone(requestedZone);				//set requested auto zone
    }
}

var BK_zoneThreshold = ROC_neutralRoc.threshold;		//get threshold
var BK_zonePrecision = rocCalculatePrecision(ROC_neutralRoc);		//calc prec
console.log("Zone precision is: "+BK_zonePrecision);				//prec for specific zone
var BK_zone = 'neutral';
function bkSetZone(newZone)
{
    console.log('Zone request to: '+newZone);						//check for specific zone and block
    let didZoneChange = false;
    switch(newZone)
    {
        case 'trusted':
            BK_zoneThreshold = ROC_trustedRoc.threshold;
            BK_zonePrecision = rocCalculatePrecision(ROC_trustedRoc);
            statusSetImageZoneTrusted();
            BK_zone = newZone;
            didZoneChange = true;
            console.log('Zone is now nonPorn!');
            break;
        case 'neutral':
            BK_zoneThreshold = ROC_neutralRoc.threshold;
            BK_zonePrecision = rocCalculatePrecision(ROC_neutralRoc);
            statusSetImageZoneNeutral();
            BK_zone = newZone;
            didZoneChange = true;
            console.log('Zone is now neutral!');
            break;
        case 'untrusted':
            BK_zoneThreshold = ROC_untrustedRoc.threshold;
            BK_zonePrecision = rocCalculatePrecision(ROC_untrustedRoc);
            statusSetImageZoneUntrusted();
            BK_zone = newZone;
            didZoneChange = true;
            console.log('Zone is now Porn!')
            break;
    }
    if(didZoneChange) {
        console.log("Zone precision is: "+BK_zonePrecision);
        bkClearPredictionBuffer();
        bkNotifyThreshold();
    }
}

function bkNotifyThreshold() {			//threshold is notified and messaged to processor
    bkBroadcastMessageToProcessors({
        type:'thresholdChange',
        threshold: BK_zoneThreshold
    });
}

async function bkImageListener(details, shouldBlockSilently=false) {
    if (details.statusCode < 200 || 300 <= details.statusCode) {				//passive filter
        return;
    }
    if (whtIsWhitelisted(details.url)) {
        console.log('WEBREQ: Normal whitelist '+details.url);
        return;
    }
    let mimeType = '';
    for(let i=0; i<details.responseHeaders.length; i++) {
        let header = details.responseHeaders[i];
        if(header.name.toLowerCase() == "content-type") {			//content based filter
            mimeType = header.value;
            if(!shouldBlockSilently) {
                header.value = 'image/svg+xml';		//media type with images
            }
            break;
        }
    }
    console.debug('WEBREQ: start headers '+details.requestId);
    let dataStartTime = null;
    let filter = browser.webRequest.filterResponseData(details.requestId);

    let processor = bkGetNextProcessor().port;
    processor.postMessage({
        type: 'start',
        requestId : details.requestId,
        mimeType: mimeType,
        url: details.url
    });
    statusStartImageCheck(details.requestId);
  
    filter.ondata = event => {
        if (dataStartTime == null) {
            dataStartTime = performance.now();
        }
        console.debug('WEBREQ: data '+details.requestId);
        processor.postMessage({ 
            type: 'ondata',
            requestId: details.requestId,
            data: event.data
        });
    }

    filter.onerror = e => {
        try
        {
            console.debug('WEBREQ: error '+details.requestId);
            processor.postMessage({
                type: 'onerror',
                requestId: details.requestId
            });
            filter.close();
        }
        catch(ex)
        {
            console.error('WEBREQ: Filter error: '+e+', '+ex);
        }
    }
  
    filter.onstop = async event => {
        console.debug('WEBREQ: onstop '+details.requestId);
        BK_openFilters[details.requestId] = filter;
        processor.postMessage({
            type: 'onstop',
            requestId: details.requestId
        });
    }
    return details;
  }

async function bkDirectTypedUrlListener(details) {
    if (details.statusCode < 200 || 300 <= details.statusCode) {
        return;
    }
    if (whtIsWhitelisted(details.url)) {
        console.log('WEBREQ: Direct typed whitelist '+details.url);
        return;
    }
    //Try to see if there is an image MIME type
    for(let i=0; i<details.responseHeaders.length; i++) {
        let header = details.responseHeaders[i];
        if(header.name.toLowerCase() == "content-type") {
            let mimeType = header.value;
            if(mimeType.startsWith('image/')) {
                console.log('WEBREQ: Direct URL: Forwarding based on mime type: '+mimeType+' for '+details.url);
                return bkImageListener(details,true);
            }
        }
    }
    //Otherwise do nothing...
    return details;
}


BK_shouldUseDnsBlocking = false;

async function bkDnsBlockListener(details) {
    let dnsResult = await dnsIsDomainOk(details.url);
    if(!dnsResult) {											//dns block - as of now false
        console.log('DNS: DNS Blocked '+details.url);
        return { cancel: true };
    }
    return details;
}

function bkSetDnsBlocking(onOrOff) {
    let effectiveOnOrOff = onOrOff && BK_isEnabled;
    console.log('CONFIG: DNS blocking set request: '+onOrOff+', effective value '+effectiveOnOrOff);
    let isCurrentlyOn = browser.webRequest.onBeforeRequest.hasListener(bkDnsBlockListener);
    if(effectiveOnOrOff != isCurrentlyOn) {
        BK_shouldUseDnsBlocking = onOrOff; //Store the requested, not effective value
        if(effectiveOnOrOff && !isCurrentlyOn) {
            console.log('CONFIG: DNS Adding DNS block listener')
            browser.webRequest.onBeforeRequest.addListener(
                bkDnsBlockListener,
                {urls:["<all_urls>"], types:["image","imageset","media"]},
                ["blocking"]
              );
        } else if (!effectiveOnOrOff && isCurrentlyOn) {
            console.log('CONFIG: DNS Removing DNS block listener')
            browser.webRequest.onBeforeRequest.removeListener(bkDnsBlockListener);
        }
        console.log('CONFIG: DNS blocking is now: '+onOrOff);
    } else {
        console.log('CONFIG: DNS blocking is already correctly set.');
    }
}

//Use this if you change BK_isEnabled
function bkRefreshDnsBlocking() {
    bkSetDnsBlocking(BK_shouldUseDnsBlocking);
}

//for b64 images



async function bkBase64ContentListener(details) {				//func to listen for base64 image
    if (details.statusCode < 200 || 300 <= details.statusCode) {
        return;
    }
    if (whtIsWhitelisted(details.url)) {
        console.log('WEBREQ: Base64 whitelist '+details.url);
        return;
    }
    console.debug('WEBREQ: base64 headers '+details.requestId+' '+details.url);
   
    let decoder, encoder;
    [decoder, encoder] = bkDetectCharsetAndSetupDecoderEncoder(details);
    if(!decoder) {
        return;
    }
    let filter = browser.webRequest.filterResponseData(details.requestId);
    let b64Filter = {
        requestId: details.requestId,
        encoder: encoder,
        filter: filter
    };
    BK_openB64Filters[details.requestId] = b64Filter;

    //Choose highest power here because we have many images possibly
    let processor = bkGetNextProcessor().port; 
    processor.postMessage({
        type: 'b64_start',
        requestId : details.requestId
    });

    filter.ondata = evt => {
        let str = decoder.decode(evt.data, {stream: true});
        processor.postMessage({
            type: 'b64_ondata',								//filter b64 data
            requestId : details.requestId,
            dataStr: str
        });
      };

    filter.onstop = async evt => {
        let str = decoder.decode(evt.data, {stream: true});
        processor.postMessage({
            type: 'b64_ondata',										//decode str for b64
            requestId : details.requestId,
            dataStr: str
        });
        processor.postMessage({
            type: 'b64_onstop',
            requestId : details.requestId
        });
    }
	
    filter.onerror = e => {					//error handling
        try
        {
            processor.postMessage({
                type: 'b64_onerror',
                requestId : details.requestId
            })
        }
        catch(e)
        {
            console.error('WEBREQ: Filter error: '+e);			//catches error occurance
        }
    }
  
  return details;				
}



function bkDetectCharsetAndSetupDecoderEncoder(details) {
    let contentType = '';
    let headerIndex = -1;
    for(let i=0; i<details.responseHeaders.length; i++) {
        let header = details.responseHeaders[i];					//detection of charset
        if(header.name.toLowerCase() == "content-type") {
            contentType = header.value.toLowerCase();
            headerIndex = i;
            break;
        }
    }
    if (headerIndex == -1) {
      console.debug('CHARSET: No Content-Type header detected for '+details.url+', adding one.');
      headerIndex = details.responseHeaders.length;
      contentType = 'text/html';						//if no chasrset detected
      details.responseHeaders.push(
        {
          "name": "Content-Type",
          "value":"text/html"
        }
      );
    }
  
    let baseType;
    if(contentType.trim().startsWith('text/html')) {
      baseType = 'text/html';
      console.debug('CHARSET: Detected base type was '+baseType);
    } else if(contentType.trim().startsWith('application/xhtml+xml')) {
      baseType = 'application/xhtml+xml';
      console.debug('CHARSET: Detected base type was '+baseType);
    } else if(contentType.trim().startsWith('image/')) {
      console.debug('CHARSET: Base64 listener is ignoring '+details.requestId+' because it is an image/ MIME type');
      return;
    } else {
      baseType = 'text/html';
      console.debug('CHARSET: The Content-Type was '+contentType+', not text/html or application/xhtml+xml.');
      return;
    }
  
  
    let decodingCharset = 'utf-8';
    let detectedCharset = bkDetectCharset(contentType);
  
    if(detectedCharset !== undefined) {
        decodingCharset = detectedCharset;
        console.debug('CHARSET: Detected charset was ' + decodingCharset + ' for ' + details.url);
    }
    details.responseHeaders[headerIndex].value = baseType+';charset=utf-8';
  
    let decoder = new TextDecoder(decodingCharset);
    let encoder = new TextEncoder(); //Encoder does not support non-UTF-8 charsets so this is always utf-8.
  
    return [decoder,encoder];
  }
  
  
// Detect the charset from Content-Type
function bkDetectCharset(contentType) {
    
  
    let charsetMarker = "charset="; // Spaces *shouldn't* matter
    let foundIndex = contentType.indexOf(charsetMarker);
    if (foundIndex == -1) {
        return undefined;
    }
    let charsetMaybeQuoted = contentType.substr(foundIndex+charsetMarker.length).trim();
    let charset = charsetMaybeQuoted.replace(/\"/g, '');
    return charset;
  }



//startup

let BK_isVideoEnabled = true;					//checking for vid enabled

function bkRegisterAllCallbacks() {

    browser.webRequest.onHeadersReceived.addListener(
        bkImageListener,
        {urls:["<all_urls>"], types:["image","imageset"]},
        ["blocking","responseHeaders"]					// listens to the given media
    );

    browser.webRequest.onHeadersReceived.addListener(
        bkDirectTypedUrlListener,
        {urls:["<all_urls>"], types:["main_frame"]},			//checks the main frames 
        ["blocking","responseHeaders"]
    );

    browser.webRequest.onHeadersReceived.addListener(
        bkBase64ContentListener,						//check for base64 images
        {
            urls:[
                "<all_urls>"
            ],
            types:["main_frame"]
        },
        ["blocking","responseHeaders"]
    );

    if(BK_isVideoEnabled) {
        browser.webRequest.onBeforeRequest.addListener(
            vidPrerequestListener,
            {urls:["<all_urls>"], types:["media","xmlhttprequest"]},
            ["blocking"]										//if vid enabled request for listening the media
        );
    
        browser.webRequest.onHeadersReceived.addListener(
            vidRootListener,
            {urls:["<all_urls>"], types:["media","xmlhttprequest"]},
            ["blocking","responseHeaders"]
        );
    }
}

function bkUnregisterAllCallbacks() {				// func removes all media lister
    browser.webRequest.onHeadersReceived.removeListener(bkImageListener);
    browser.webRequest.onHeadersReceived.removeListener(bkDirectTypedUrlListener);
    browser.webRequest.onHeadersReceived.removeListener(bkBase64ContentListener);

    if(BK_isVideoEnabled) {
        browser.webRequest.onBeforeRequest.removeListener(vidPrerequestListener);
        browser.webRequest.onHeadersReceived.removeListener(vidRootListener);			//if vid enabled, remove the root listener
    }
}

let BK_isEnabled = false;
function bkSetEnabled(isOn) {
    console.log('CONFIG: Setting enabled to '+isOn);
    if(isOn == BK_isEnabled) {
        return;
    }
    console.log('CONFIG: Handling callback wireup change.');
    if(isOn) {
        bkRegisterAllCallbacks();
    } else {
        bkUnregisterAllCallbacks();
    }
    BK_isEnabled = isOn;
    bkRefreshDnsBlocking();
    console.log('CONFIG: Callback wireups changed!');
}

let BK_isOnOffSwitchShown = false;

function bkUpdateFromSettings() {		//setting Update
    browser.storage.local.get("is_dns_blocking").then(dnsResult=>
    bkSetDnsBlocking(dnsResult.is_dns_blocking == true));				//domain name server blocking
    browser.storage.local.get("is_on_off_shown").then(onOffResult=>
    BK_isOnOffSwitchShown = onOffResult.is_on_off_shown == true);
}

function bkHandleMessage(request, sender, sendResponse) {
    if(request.type=='setZone')
    {
        bkSetZone(request.zone);
    }
    else if(request.type=='getZone')
    {
        sendResponse({zone: BK_zone});
    }
    else if(request.type=='setZoneAutomatic')					//zone settings and block accordingly
    {
        bkSetZoneAutomatic(request.isZoneAutomatic);
    }
    else if(request.type=='getZoneAutomatic')
    {
        sendResponse({isZoneAutomatic:BK_isZoneAutomatic});
    }
    /*else if(request.type=='setDnsBlocking')							//dns block
    {
        bkUpdateFromSettings();
    }*/
    else if(request.type=='getOnOff')
    {
        sendResponse({onOff:BK_isEnabled ? 'on' : 'off'});
    }
    else if(request.type=='setOnOff')
    {
        bkSetEnabled(request.onOff=='on');
    }
    else if(request.type=='getOnOffSwitchShown')
    {
        sendResponse({isOnOffSwitchShown: BK_isOnOffSwitchShown});
    }
    else if(request.type=='setOnOffSwitchShown')
    {
        bkUpdateFromSettings();
    }
}
browser.runtime.onMessage.addListener(bkHandleMessage);		//listens to message and sets to neutral
bkSetZone('neutral');

//try somethings - remove video part, change the zones, enable dns
