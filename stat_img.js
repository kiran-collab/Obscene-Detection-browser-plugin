const icon_32_img = new Image();
icon_32_img.src = 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBzdGFuZGFsb25lPSJubyI/Pgo8IURPQ1RZUEUgc3ZnIFBVQkxJQyAiLS8vVzNDLy9EVEQgU1ZHIDIwMDEwOTA0Ly9FTiIKICJodHRwOi8vd3d3LnczLm9yZy9UUi8yMDAxL1JFQy1TVkctMjAwMTA5MDQvRFREL3N2ZzEwLmR0ZCI+CjxzdmcgdmVyc2lvbj0iMS4wIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciCiB3aWR0aD0iMzIuMDAwMDAwcHQiIGhlaWdodD0iMzIuMDAwMDAwcHQiIHZpZXdCb3g9IjAgMCAzMi4wMDAwMDAgMzIuMDAwMDAwIgogcHJlc2VydmVBc3BlY3RSYXRpbz0ieE1pZFlNaWQgbWVldCI+CjxtZXRhZGF0YT4KQ3JlYXRlZCBieSBwb3RyYWNlIDEuMTYsIHdyaXR0ZW4gYnkgUGV0ZXIgU2VsaW5nZXIgMjAwMS0yMDE5CjwvbWV0YWRhdGE+CjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDAuMDAwMDAwLDMyLjAwMDAwMCkgc2NhbGUoMC4xMDAwMDAsLTAuMTAwMDAwKSIKZmlsbD0iIzAwMDAwMCIgc3Ryb2tlPSJub25lIj4KPHBhdGggZD0iTTk5IDI3NyBjLTkwIC02MCAtODggLTE4MSA0IC0yMzcgNjEgLTM4IDE0NCAtMTQgMTc5IDUxIDY3IDEyNCAtNjkKMjYzIC0xODMgMTg2eiIvPgo8L2c+Cjwvc3ZnPgo=';
icon_32_img.width = 32; 	//width
icon_32_img.height = 32;	//height
icon_32_img.onload = function() {
    statusRegenerateIcon();				//load status img
}


//checks can occur that fail and do not result in either a block or a pass.
//Therefore, use block+pass as the total count in certain cases

let STATUS_imageCounts = {
    'pass' : 0,
    'block' : 0,
    'tiny' : 0,						//counts for all status
    'error' : 0
};
let STATUS_imageCheckCount = 0;
let STATUS_openImageFilters = { };
let STATUS_openImageHighWaterCount = 0;

let STATUS_videoCounts = {
    'pass' : 0,
    'block' : 0,
    'error' : 0
};
let STATUS_openVideoFilters = { };
let STATUS_videoProgressCounter = 0;
let STATUS_videoLastBlockProgressCounter = -999;

const STATUS_ICON_SIZE = 32;
let STATUS_iconCanvas = document.createElement('canvas');
STATUS_iconCanvas.width = STATUS_ICON_SIZE;
STATUS_iconCanvas.height = STATUS_ICON_SIZE;
let STATUS_zoneFill = 'white';
let STATUS_zoneFillOffset = 'white';

let STATUS_lastZoneFill = '';
let STATUS_lastProgressWidth = 0;
let STATUS_lastIsVideoInProgress = true;
let STATUS_lastIsVideoBlockShown = true;
let STATUS_lastVideoProgressCounter = -1;

const STATUS_blockFadeoutColors = [
    'rgba(255,0,0,1.0)',
    'rgba(255,0,0,1.0)'
];

function statusRegenerateIcon() {
    // 1. First, do we need to do anything? Do this analysis to avoid extra icon flickering
    let currentProgressWidth = -1;
    if(STATUS_openImageHighWaterCount > 0) {
        let currentLength = statusGetOpenImageCount();
        let percentage = currentLength / STATUS_openImageHighWaterCount;
        currentProgressWidth = Math.round(percentage*24);
    }

    let isVideoInProgress = statusGetOpenVideoCount() > 0;
    let stepsSinceLastBlock = STATUS_videoProgressCounter - STATUS_videoLastBlockProgressCounter
    let isVideoBlockShown =  stepsSinceLastBlock < STATUS_blockFadeoutColors.length;
    

    
    if(STATUS_zoneFill == STATUS_lastZoneFill &&
        currentProgressWidth == STATUS_lastProgressWidth &&
        isVideoInProgress == STATUS_lastIsVideoInProgress &&
        isVideoBlockShown == STATUS_lastIsVideoBlockShown) {
        return;
    }

    // Save current state to last state
    STATUS_lastZoneFill = STATUS_zoneFill;
    STATUS_lastProgressWidth = currentProgressWidth;
    STATUS_lastIsVideoInProgress = isVideoInProgress;
    STATUS_lastIsVideoBlockShown = isVideoBlockShown;
    STATUS_lastVideoProgressCounter = STATUS_videoProgressCounter;

    // Actually generate and set new icon
    let ctx = STATUS_iconCanvas.getContext('2d');
    ctx.clearRect(0,0,STATUS_ICON_SIZE,STATUS_ICON_SIZE);

    // Zone background
    ctx.fillStyle = STATUS_zoneFill;
    ctx.fillRect(0,0,STATUS_ICON_SIZE,STATUS_ICON_SIZE);

    // Icon
    ctx.drawImage(icon_32_img, 0, 0);

    // Image progress
    if(currentProgressWidth >= 0) {
        ctx.fillStyle = STATUS_zoneFillOffset;
        ctx.fillRect(0, 24, currentProgressWidth, 8);
    }

    if(isVideoInProgress || isVideoBlockShown) {
        ctx.fillStyle = isVideoBlockShown ? 'white' : STATUS_zoneFillOffset;
        ctx.fillRect(24, 24, 8, 8);

        ctx.fillStyle = isVideoBlockShown ? STATUS_blockFadeoutColors[stepsSinceLastBlock] : 'black';
        ctx.font = '8px sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText('V', 24, 24);
    }

    let imageData = ctx.getImageData(0,0,STATUS_ICON_SIZE,STATUS_ICON_SIZE);
    browser.browserAction.setIcon({ imageData: imageData });
}



function statusInitialize() {
    browser.browserAction.setIcon({path: "icons/icon_32_1.png"});
}

function statusOnLoaded() {
    browser.browserAction.setTitle({title: "StopPorn"});
    statusSetImageZoneNeutral();
}

function statusSetImageZoneTrusted() {
    STATUS_zoneFill = '#88CC88';
    STATUS_zoneFillOffset = '#66AA66';				//set zone image for non Porn
    statusRegenerateIcon();
}

function statusSetImageZoneNeutral() {
    STATUS_zoneFill = '#CCCCCC';					//set zone image for neutral
    STATUS_zoneFillOffset = '#AAAAAA';
    statusRegenerateIcon();
}

function statusSetImageZoneUntrusted() {
    STATUS_zoneFill = '#DD9999';
    STATUS_zoneFillOffset = '#AA6666';					//set zone image for porn
    statusRegenerateIcon();
}

function statusGetOpenVideoCount() {
    return Object.keys(STATUS_openVideoFilters).length;
}

function statusStartVideoCheck(requestId) {
    STATUS_openVideoFilters[requestId] = requestId;
    statusUpdateVisuals();
}

function statusIndicateVideoProgress(requestId) {
    STATUS_videoProgressCounter++;							//count proc for vid
    statusUpdateVisuals();
}

function statusCompleteVideoCheck(requestId, status) {			//check status for video
    try {
        if(status == 'block') {
            STATUS_videoLastBlockProgressCounter = STATUS_videoProgressCounter;
        }
        delete STATUS_openVideoFilters[requestId];
        statusUpdateVisuals();
    } catch(e) {
    }
}

function statusGetOpenImageCount() {
    return Object.keys(STATUS_openImageFilters).length;
}

function statusStartImageCheck(requestId) {
    STATUS_openImageFilters[requestId] = requestId;					//start status process
    let currentLength = statusGetOpenImageCount();
    if(currentLength > STATUS_openImageHighWaterCount) {
        STATUS_openImageHighWaterCount = currentLength;
    }
}

function statusCompleteImageCheck(requestId, status) {
    delete STATUS_openImageFilters[requestId];
    STATUS_imageCounts[status]++;
    STATUS_imageCheckCount++;
    let currentLength = statusGetOpenImageCount();			//check for status complete
    if(currentLength == 0) {
        STATUS_openImageHighWaterCount = 0;
    }
    statusUpdateVisuals();
}

function statusUpdateVisuals() {
    if(STATUS_imageCounts['block'] > 0) {
        let txt = (STATUS_imageCounts['block'] < 1000) ? STATUS_imageCounts['block']+'' : '999+';
        browser.browserAction.setBadgeText({ "text": txt });										//status count func.
    }
    
    let openRequestIds = Object.keys(STATUS_openImageFilters);
    browser.browserAction.setTitle({ title: 'Blocked '+STATUS_imageCounts['block']+'/'+STATUS_imageCheckCount+' total images\r\n'
        + openRequestIds.length +' open requests: \r\n'+openRequestIds.join('\r\n') });				//msg for imgs blocked by total imgs

    statusRegenerateIcon();				//set icon accordingly
}