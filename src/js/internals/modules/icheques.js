module.exports = function (controller) {

    if (controller.confs.icheques.hosts.indexOf(document.location.hostname) >= 0) {
        controller.registerBootstrap("icheques::init::plataform", function (callback) {
            $.getScript("js/icheques.js", function () {
                callback();
            });
        });
    }

};