/* global module */

module.exports = function (controller) {

    controller.registerCall("icheques::welcome", function (ret) {

        var report = controller.call("report",
                "Seja bem vindo ao iCheques",
                "Cheque sem susto.",
                "O iCheques é uma ferramenta desenvolvida para você evitar inadimplência em sua carteira de cheques e tambem possibilita a antecipação com seus parceiros financeiros.",
                false);

        report.button("Adicionar Cheque", function () {
            controller.call("icheques::newcheck");
        });

        report.button("Dados Cadastrais", function () {
            controller.call("icheques::form::company");
        });

//        switch ($("BPQL > body > type", ret).text()) {
//            case "credit-anticipator":
//                report.button("Adicionar Fundo", function () {
//                    /* cria subchave */
//                });
//                break;
//
//            case "retail":
//                report.button("Adicionar Empresa", function () {
//                    /* cria subchave */
//                });
//                break;
//        }
//        report.button("Dados Bancários", function () {
//            controller.call("icheques::form::bank");
//        });

        report.gamification("shield");

        $(".app-content").prepend(report.element());
    });

    controller.registerTrigger("call::authentication::loggedin", "icheques::welcome", function (args, callback) {
        callback();
        controller.serverCommunication.call("SELECT FROM 'ICHEQUESAUTHENTICATION'.'ANNOTATIONS'", {
            success: function (ret) {
                controller.call("icheques::welcome", ret);
            }
        });
    });

};
