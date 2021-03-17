window.onload=function()			//load popup window
{
    let rdfm = document.getElementById('popupForm').zone;
    for (var i = 0; i < rdfm.length; i++) {
        rdfm[i].addEventListener('change', function(e) {					//listen to the zon
            browser.runtime.sendMessage({ type: 'setZone', zone: e.target.id });
            browser.runtime.sendMessage({ type: 'setZoneAutomatic', isZoneAutomatic: false });
            window.close();
        });
    }
    let sending = browser.runtime.sendMessage({type:'getZone'});
    sending.then(
        function(message)
        {															//send zone to other modules
            console.log('Restoring state onto '+message.zone);
            document.getElementById(message.zone).checked = true;
        },
        function(error)
        {
            console.log('Error for zone: '+error);
        }
    )
    let autoBox = document.getElementById('popupForm').zoneAuto;
    autoBox.addEventListener('change', function(e) {					//change to auto zone
        browser.runtime.sendMessage({ type: 'setZoneAutomatic', isZoneAutomatic: e.target.checked });
        window.close();
    });
    let automatic = browser.runtime.sendMessage({type:'getZoneAutomatic'});
    automatic.then(
        function(message)									//if auto zone
        {
            console.log('Again resetting zone visual state for automatic to '+message.isZoneAutomatic);
            document.getElementById('isZoneAutomatic').checked = message.isZoneAutomatic;
        },
        function(error)
        {
            console.log('Error for automatic: '+error);
        }
    );
    let checkOnOff = document.getElementById('isOnOff');
    checkOnOff.addEventListener('change', function(e) {
        console.log('Setting on/off to '+e.target.checked);
        browser.runtime.sendMessage({ type: 'setOnOff', onOff: e.target.checked ? 'on' : 'off' });
        window.close();								//change to on off
    })
    let sendingOnOff = browser.runtime.sendMessage({type:'getOnOff'});
    sendingOnOff.then(
        function(message)
        {
            console.log('Restoring on-off to '+message.onOff);
            document.getElementById('isOnOff').checked = message.onOff=='on';
        }
        function(error)
        {
            console.log('Error to get on-off: '+error);
        }
    )
    let sendingOnOffShown = browser.runtime.sendMessage({type:'getOnOffSwitchShown'});
    sendingOnOffShown.then(
        function(message)
        {
            console.log('Restoring on/off shown state to '+message.isOnOffSwitchShown);
            document.getElementById('isOnOffSection').className = message.isOnOffSwitchShown ? 'switch_visible' : 'switch_hidden';
        },
        function(error)							
        {
            console.log('Error to show on-off: '+error);
        }
    )
}