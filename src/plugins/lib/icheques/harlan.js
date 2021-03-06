/* global toastr, require, module, numeral, moment */
var async = require("async"),
    StringMask = require("string-mask"),
    _ = require("underscore"),
    squel = require("squel"),
    changeCase = require('change-case'),
    CNPJ = require("cpf_cnpj").CNPJ;

import {
    CMC7Parser
} from "./cmc7-parser.js";
import truncate from "truncate";
import hash from "hash.js";
import url from 'url';

var SEARCH_REGEX = /cheq?u?e?/i,
    FIDC = /fid?c?/i,
    LIMIT = 5,
    CMC7_MASK = new StringMask("00000000 0000000000 000000000000"),
    QUERY_LIMIT = 2000;

var dictMessage = {
    'a0ff6ee5f68cdbb5132568fd4cec7eca519725a7186d24866a6c55d0a42b3ca6': "Consulta realizada com sucesso sem ocorrência no cheque",
};

module.exports = function(controller) {

    controller.call("link::register", /^.*/, (href) => {
        let query = url.parse(href, true).query;
        if (!query.cmc) return false;
        controller.call("icheques::cmc::show", query.cmc);
        return true;
    });

    controller.registerCall("icheques::cmc::show", (cmc) => {
        let searchString = cmc.replace(/[^\d]/, '');
        let query = squel.select()
            .from("ICHEQUES_CHECKS")
            .where(squel.expr().or("CMC = ?", searchString)).toString();

        let databaseResult = controller.call("icheques::resultDatabase", controller.database.exec(query)[0]);
        if (!databaseResult.values.length) {
            controller.alert({
                title: "Não foi possível localizar o cheque.",
                subtitle: `Sem cheque de CMC7 ${CMC7_MASK.apply(searchString)}`,
                paragraph: "O cheque pode ter sido removido ou antecipado e por isso não conta em sua conta."
            });
            return false;
        }

        controller.call("icheques::show", [databaseResult.values[0]], null, null, true);
        return true;
    });

    controller.registerTrigger("icheques::end", "open", (opts, cb) => {
        cb();
        if (!controller.query.cmc) return;
        controller.call("icheques::cmc::show", controller.query.cmc);
    });

    controller.registerCall("icheques::history", (check) => {
        const LIMIT = 5;
        var modal = controller.call("modal"),
            skipResults = 0;

        modal.gamification();
        modal.title("Consultas e Protocolos");
        modal.subtitle("Últimas Consultas Realizadas e Protocolos");
        modal.paragraph("Através deste relatório você poderá visualizar as consultas realizadas e respectivos protocolos.");


        let form = modal.createForm(),
            list = form.createList();

        let actions = modal.createActions();
        actions.cancel();

        var count = actions.observation(),
            backButton = actions.add("Página Anterior").click(e => updateAjax(e, -1)),
            nextButton = actions.add("Próxima Página").click(e => updateAjax(e));

        let error = () => {
            modal.close();
            controller.alert({
                title: "Não há registros para serem exibidos",
                subtitle: "Tente novamente mais tarde quando já teremos consultas realizadas para este cheque.",
                paragraph: "Tentaremos consultar este cheque em instantes, tenha um pouco de paciência e tente novamente mais tarde."
            });
        };

        let update = (data) => {
            let pages = Math.ceil(data.count / LIMIT),
                currentPage = (skipResults ? skipResults / LIMIT : 0) + 1;
            count.text(`Página ${currentPage} de ${pages}`);

            backButton[currentPage == 1 ? "hide" : "show"]();
            nextButton[currentPage >= pages ? "hide" : "show"]();

            let values = _.values(data.data);
            list.empty();
            for (let row of values) {
                let doc = $.parseXML(row.document.data),
                    exception = $("exception", doc);
                if (exception.length) {
                    list.item("fa-close", [moment.unix(row.created).fromNow(), "Ocorreu uma exceção na consulta",
                        "A consulta ao cheque fracassou, tentando novamente em alguns instantes."
                    ]);
                } else {
                    let message = $("ocorrencias descricao", doc).text() || $("situacaoConsultaCheque exibicao", doc).text(),
                        hashMessage = hash.sha256().update(message).digest('hex');
                    list.item("fa-check", [moment.unix(row.created).fromNow(), dictMessage[hashMessage] || message,
                        `Protocolo: ${$("numProtCons", doc).text()}`
                    ]);
                }
            }

            if (!values.length) error();
        };

        let updateAjax = (e, direction = 1) => {
            if (e) e.preventDefault();
            skipResults += LIMIT * direction;
            controller.server.call("SELECT FROM 'ICHEQUES'.'HISTORY'", controller.call("loader::ajax", controller.call("error::ajax", {
                data: {
                    id: check.pushId,
                    skip: skipResults,
                    limit: LIMIT
                },
                dataType: "json",
                success: (data) => update(data),
                bipbopError: () => error()
            }, true)));
        };

        updateAjax(null, 0);
    });

    controller.registerCall("icheques::debtCollector", (check) => {
        var inputExpire;
        let dispachEvent = (formData) => {
            check.expire = moment(inputExpire.val(), "DD/MM/YYYY").format("YYYYMMDD");
            controller.server.call("UPDATE 'ICHEQUES'.'DebtCollector'", controller.call("error::ajax", {
                method: "post",
                type: "json",
                data: Object.assign({}, check, formData, {
                    debtCollector: controller.confs.debtCollector
                }),
                success: () => {
                    check.debtCollector = true;
                    controller.call("alert", {
                        icon: "pass",
                        title: "Parabéns, cheque enviado para cobrança!",
                        subtitle: "Seu cheque foi enviado para cobrança.",
                        paragraph: "A cobrança tentará recuperar os valores e em breve entrará em contato.",
                        confirmText: "Compreendi"
                    });
                }
            }));
        };

        let collectBill = () => controller.call("form", dispachEvent).configure({
            "title": "Envie o cheque para cobrança",
            "subtitle": "Para enviar o cheque ao nosso módulo de cobrança você deve informar a alínea carimbada no verso do cheque.",
            "gamification": "star",
            "screens": [{
                "fields": [{
                    "name": "alinea",
                    "type": "select",
                    "labelText": "Alínea de Retorno",
                    "optional": false,
                    "list": {
                        '11': "Alínea 11: Insuficiência de fundos – 1ª apresentação",
                        '12': "Alínea 12: Insuficiência de fundos – 2ª apresentação",
                        '13': "Alínea 13: Conta encerrada",
                        '14': "Alínea 14: Prática espúria",
                        '20': "Alínea 20: Folha de cheque cancelada por solicitação do correntista",
                        '21': "Alínea 21: Contra-ordem (ou revogação) ou oposição (ou sustação) do pagamento pelo emitente ou portador do cheque",
                        '22': "Alínea 22: Divergência ou insuficiência de assinatura (só válida se houver saldo)",
                        '31': "Alínea 31: Erro formal",
                        '44': "Alínea 44: Cheque prescrito",
                        '48': "Alínea 48: Cheque acima de R$ 100,00 sem a indicação do favorecido",
                        '51': "Alínea 51: Divergência no valor recebido"
                    }
                }]
            }]
        });

        let sendBill = () => controller.call("bankAccount::need", collectBill);
        let createList = (modal, form) => {
            inputExpire = form.addInput("Vencimento", "text", "Vencimento do Cheque").mask("00/00/0000").val(moment(check.expire, "YYYYMMDD").format("DD/MM/YYYY"));
            inputExpire.pikaday();
            var list;
            let renderList = (inputMoment) => {
                if (list) {
                    let newList = form.createList();
                    list.element().replaceWith(newList.element());
                    list = newList;
                } else {
                    list = form.createList();
                }
                let days = moment().diff(inputMoment || moment(check.expire, "YYYYMMDD"), 'days');
                list.item(days <= 180 ? "fa-check-square" : "fa-square", ["De 1 até 180 dias de atraso", "10% - do Principal", numeral((check.ammount / 100) * 0.9).format("$0,0.00")]);
                list.item(days >= 181 && days <= 364 ? "fa-check-square" : "fa-square", ["De 181 Até 364 dias de atraso", "15% - do Principal", numeral((check.ammount / 100) * 0.85).format("$0,0.00")]);
                list.item(days >= 365 && days <= 729 ? "fa-check-square" : "fa-square", ["De 365 Até 729 dias de atraso", "20% - do Principal", numeral((check.ammount / 100) * 0.8).format("$0,0.00")]);
                list.item(days >= 730 && days <= 1094 ? "fa-check-square" : "fa-square", ["De 730 Até 1094 dias de atraso", "30% - do Principal", numeral((check.ammount / 100) * 0.7).format("$0,0.00")]);
                list.item(days >= 1095 && days <= 1459 ? "fa-check-square" : "fa-square", ["De 1095 Até 1459 dias de atraso", "40% - do Principal", numeral((check.ammount / 100) * 0.6).format("$0,0.00")]);
                list.item(days >= 1460 && days <= 1824 ? "fa-check-square" : "fa-square", ["De 1460 Até 1824 dias de atraso", "50% - do Principal", numeral((check.ammount / 100) * 0.5).format("$0,0.00")]);
                list.item(days >= 1825 ? "fa-check-square" : "fa-square", ["Mais de 1825 dias de atraso", "60% - do Principal", numeral((check.ammount / 100) * 0.4).format("$0,0.00")]);
            };
            renderList();
            inputExpire.change(() => renderList(moment(inputExpire.val(), "DD/MM/YYYY")));
            modal.paragraph("Os valores podem mudar pelo pagamento de taxas e afins.").addClass("observation");
        };

        let confirm = (err) => {
            if (err) return;
            controller.confirm({
                title: "Enviar seu cheque para cobrança?",
                subtitle: "Não há custos na cobrança; é retido a comissão (%) somente se há sucesso na recuperação de seu cheque.",
                paragraph: "Veja abaixo a tabela de comissionamento, e caso aceite nossos termos de serviço, pode enviar seu cheque para cobrança.  Caso seja recuperado o valor cobrado, será creditado na conta bancária cadastrada. O contrato de serviço está disponível <a target='_blank' href='legal/icheques/TERMOS COBRANCA.pdf' title='contrato de serviço'>neste link</a>, após a leitura clique em confirmar para aceitar os termos.",
            }, sendBill, null, createList, true, () => {
                if (moment(inputExpire.val(), "DD/MM/YYYY").isAfter(moment())) {
                    inputExpire.addClass("error");
                    return false;
                }
                return true;
            });
        };
        if (!check.ammount) controller.call("icheques::item::edit", check, confirm, false, null, false);
        else confirm();
    });

    var registerSocket = () => {
        controller.registerTrigger("serverCommunication::websocket::ichequeUpdate", "icheques::pushUpdate", function(data, callback) {
            callback();

            var dbResponse = controller.database.exec(squel
                .select()
                .from("ICHEQUES_CHECKS")
                .where("PUSH_ID = ?", data.pushId).toString());

            if (!dbResponse.length) {
                controller.call("icheques::insertDatabase", data);
                return;
            }

            controller.database.exec(squel
                .update()
                .table("ICHEQUES_CHECKS")
                .where("PUSH_ID = ?", data.pushId)
                .setFields(controller.call("icheques::databaseObject", data)).toString());

            controller.trigger("icheques::update", data);
            controller.call("icheques::item::upgrade", data);
        });
    };

    controller.registerTrigger("authentication::authenticated", "icheques::sync::authentication::authenticated", function(data, callback) {
        if (controller.server.freeKey()) {
            callback();
            return;
        }

        var unregister = null,
            loaderTimeout = setTimeout(function() {
                unregister = $.bipbopLoader.register();
            }, 1000),
            hasResult = false,
            skip = 0;

        async.doUntil((cb) => {
            controller.server.call("SELECT FROM 'ICHEQUES'.'CHECKS'", controller.call("error::ajax", {
                data: {
                    'q[0]': "SELECT FROM 'ICHEQUES'.'CHECKS'",
                    'q[1]': "SELECT FROM 'ICHEQUESFIDC'.'OPERATION'",
                    'limit': QUERY_LIMIT,
                    'skip': skip,
                    'approved': 'true'
                },
                error: () => cb(Array.from(arguments)),
                success: function(ret) {
                    var storage = [];
                    skip += QUERY_LIMIT;
                    hasResult = false;
                    $(ret).find("check").each(function() {
                        hasResult = true;
                        storage.push(controller.call("icheques::parse::element", this));
                    });

                    controller.call("icheques::insertDatabase", storage);
                    cb();
                },
            }));
        }, () => !hasResult, () => {
            registerSocket();
            clearTimeout(loaderTimeout);
            if (unregister)
                unregister();
            callback();
            controller.trigger("icheques::end");
        });
    });

    var showCheck = function(check, result, section) {
        var separatorData = {},
            separator = result.addSeparator("Verificação de Cheque",
                "Verificação de Dados do Cheque",
                "Cheque CMC7 " + CMC7_MASK.apply(check.cmc.replace(/[^\d]/g, "")),
                separatorData);

        controller.call("tooltip", separatorData.menu, "Editar Cheque").append($("<i />").addClass("fa fa-edit")).click(controller.click("icheques::item::edit", check));
        controller.call("tooltip", separatorData.menu, "Histórico do Cheque").append($("<i />").addClass("fa fa-history")).click(controller.click("icheques::history", check));

        if (controller.confs.ccf && moment().isAfter(moment(check.expire, "YYYYMMDD"))) {
            controller.call("tooltip", separatorData.menu, "Histórico de Cobrança").append($("<i />").addClass("fa fa-bullseye")).click((e) => {
                controller.server.call("SELECT FROM 'ICHEQUES'.'DebtCollectorHistory'", controller.call("error::ajax", controller.call("loader::ajax", {
                    dataType: "json",
                    data: {
                        cmc: check.cmc
                    },
                    success: (entity) => {
                        let skip = 0,
                            modal = controller.call("modal");
                        modal.gamification();
                        modal.title("Atualização da Cobrança");
                        modal.subtitle("Arquivo de Contato com o Sacado");
                        modal.paragraph("Este um histórico do que houve no contato com o sacado informado pela operadora de cobranças.");
                        let list = modal.createForm().createList(),
                            actions = modal.createActions();
                        // actions.add("Novo Contato").click(controller.click("dive::history::new", entity, () => more(null, 0)));
                        let more,
                            observation = actions.observation("Carregando"),
                            backButton = actions.add("Voltar Página").click((e) => more(e, -1)),
                            nextButton = actions.add("Próxima Página").click((e) => more(e));

                        more = (e, direction = 1, newEntity = null) => {
                            if (newEntity) entity = newEntity;
                            if (e) e.preventDefault();
                            skip += LIMIT * direction;
                            list.empty();
                            if (!entity.history || !entity.history.length) {
                                modal.close();
                                controller.alert({
                                    title: "Não há histórico de cobrança disponível.",
                                    subtitle: "Pode ser que os operadores de cobrança estejam tentando entrar em contato ainda.",
                                    paragraph: "Fique tranquilo, a cobrança que opera para a iCheques é competente e logo teremos um retorno."
                                });
                                return;
                            }

                            let pages = Math.ceil(entity.history.length / LIMIT),
                                page = (skip ? skip / LIMIT : 0) + 1;

                            nextButton[page == pages ? 'hide' : 'show']();
                            backButton[page == 1 ? 'hide' : 'show']();
                            observation.text(`Página ${page} de ${pages}`);

                            for (let contact of entity.history.slice(skip, skip + LIMIT)) {
                                let when = moment.unix(contact.when),
                                    next = moment.unix(contact.next);

                                list.item("fa-archive", [
                                    truncate(contact.observation, 40),
                                    when.fromNow()
                                ]).click((e) => {
                                    e.preventDefault();
                                    let modal = controller.call("modal");
                                    modal.title("Atualização da Cobrança");
                                    modal.subtitle(`Histórico do Contato ${when.format('LLLL')}`);
                                    modal.paragraph(contact.observation);
                                    modal.createActions().cancel();
                                });
                            }
                        };

                        more(null, 0);
                        actions.cancel();
                    }
                })));
            });
            controller.call("tooltip", separatorData.menu, "Cobrar Cheque")
                .append($("<i />").addClass("fa fa-life-buoy")).click((e) => {
                    e.preventDefault();
                    if (!check.debtCollector) {
                        controller.call("icheques::debtCollector", check);
                    } else {
                        controller.confirm({
                            title: "Você deseja REMOVER o cheque da cobrança?",
                            subtitle: "Não há custo para cancelar ou enviar para cobrança.",
                            paragraph: "Todas e quaisquer cobranças ao sacado serão interrompidas se clicar em CONFIRMAR."
                        }, () => {
                            controller.server.call("DELETE FROM 'ICHEQUES'.'DebtCollector'", {
                                data: check,
                                success: () => {
                                    delete check.debtCollector;
                                    controller.alert({
                                        icon: "pass",
                                        title: "Uoh! Cheque recuperado da cobrança!",
                                        subtitle: "Seu cheque foi recuperado da cobrança.",
                                        paragraph: "A cobrança não mais tentará recuperar os valores. Entramos em contato para informá-los.",
                                        confirmText: "Compreendi"
                                    });
                                }
                            });
                        });
                    }
                });
        }

        controller.call("tooltip", separatorData.menu, "+30 dias").append($("<i />").addClass("fa fa-hourglass-half")).click((e) => {
            e.preventDefault();
            controller.call("icheques::item::add::time", check);
        });

        if (check.operation) {
            controller.call("tooltip", separatorData.menu, "Devolver").append($("<i />").addClass("fa fa-reply")).click((e) => {
                e.preventDefault();
                controller.confirm({
                    title: "Você deseja realmente devolver o cheque?",
                    subtitle: "Esta operação não pode ser desfeita.",
                    paragraph: "Atenção! Caso devolver o cheque, ele sumirá de sua carteira, e esta operação não poderá ser desfeita!"
                }, () => {
                    controller.server.call("DELETE FROM 'ICHEQUESFIDC'.'OPERATION'",
                        controller.call("error::ajax", controller.call("loader::ajax", {
                            data: {
                                cmc: check.cmc
                            }
                        })));
                });
            });
        } else {
            controller.call("tooltip", separatorData.menu, "Remover Cheque").append($("<i />").addClass("fa fa-trash")).click((e) => {
                e.preventDefault();
                controller.confirm({
                    title: "Remover Cheque da Carteira"
                }, () => {
                    controller.server.call("DELETE FROM 'ICHEQUES'.'CHECK'", {
                        data: {
                            cmc: check.cmc
                        },
                        success: () => {
                            toastr.warning("O cheque foi removido com sucesso.", "Esse cheque não existe mais em nossa base de dados.");
                        }
                    });
                });
            });
        }

        separator.addClass("external-source loading");
        var checkResult = controller.call("result");
        checkResult.element().insertAfter(separator);
        if (check.ammount) {
            checkResult.addItem("Valor", numeral(check.ammount / 100).format("$0,0.00"));
        }

        checkResult.addItem("Número do Cheque", new CMC7Parser(check.cmc).number);

        var expiration;
        if (check.expire) {
            expiration = checkResult.addItem("Expiração", moment(check.expire, "YYYYMMDD").format("DD/MM/YYYY"));
        }

        if (check.observation) {
            checkResult.addItem("Observação", check.observation);
        }

        var nodes = [];
        var documentDelete = function() {
                separator.remove();
                checkResult.element().remove();
            },
            documentUpdate = function(check) {
                section[0].removeClass("loadingCheck");
                separator.data("item", check);

                var rescan = function() {
                    for (var i in nodes) {
                        nodes[i].remove();
                    } /* rescan */
                    nodes = [];
                    separator.removeClass("loading success error warning");
                };

                if (check.exceptionMessage) {
                    if (check.exceptionPushable) {
                        rescan();
                        separator.addClass("warning");
                        nodes.push(checkResult.addItem("Erro", check.exceptionMessage));
                    }
                    return;
                }

                if (check.expire && expiration) {
                    expiration.find(".value").text(moment(check.expire, "YYYYMMDD").format("DD/MM/YYYY"));
                }

                if (check.queryStatus && check.queryStatus !== 10) {
                    rescan();

                    if (check.debtCollector) {
                        nodes.push(checkResult.addItem("Cobrança", "Ativa"));
                    }

                    if (check.lastDebtCollectorMessage) {
                        nodes.push(checkResult.addItem("Última Histórico do Sacado", check.lastDebtCollectorMessage));
                    }

                    section[0].removeClass("loading");

                    var elementClass = "success",
                        situation = check.situation,
                        display = check.display,
                        ocurrence = check.ocurrence;

                    if (check.queryStatus !== 1) {
                        elementClass = "error";
                        section[0].addClass("warning");
                        separator.find("h4").text(check.situation);
                    }

                    separator.addClass(elementClass);

                    nodes.push(checkResult.addItem("Situação (" + check.queryStatus + ")", situation));
                    nodes.push(checkResult.addItem("Exibição", display));
                    if (check.lastUpdate) {
                        let lastUpdate = moment.unix(check.lastUpdate);
                        nodes.push(checkResult.addItem("Última Alteração (" + lastUpdate.fromNow() + ")", lastUpdate.format("DD/MM/YYYY")));
                    }

                    if (check.ocurrenceCode) {
                        nodes.push(checkResult.addItem("Ocorrência (" + check.ocurrenceCode + ")", ocurrence));
                    }

                    separator.addClass(elementClass);
                } else {
                    section[0].addClass("loadingCheck");
                }
            };

        documentUpdate(check);
        separator.addClass("pushid-" + check.pushId);
        separator.addClass("cmc-" + check.cmc);
        separator.data("upgrade", documentUpdate);
        separator.data("delete", documentDelete);
        return documentUpdate;
    };

    var showChecks = function(checks, result, section) {
        for (var i in checks) {
            showCheck(checks[i], result, section);
        }
    };

    var showDocument = function(task) {
        var section = controller.call("section",
                "iCheques",
                "Monitoramento de cheques.",
                "CPF/CNPJ " + task[0], false, true),
            result = controller.call("result");
        section[1].append(result.element());
        section[0].addClass("icheque loading");

        if (!$(".ichequesAccountOverview").length) {
            controller.call("icheques::report::overview", false, false);
        }

        showChecks(task[1], result, section);

        let mensagem = section[0].find("h3").text();

        if (controller.confs.ccf) {


            controller.server.call("SELECT FROM 'SEEKLOC'.'CCF'", {
                data: {
                    documento: task[0]
                },
                success: (ret) => {
                    let totalRegistro = parseInt($(ret).find("BPQL > body > data > resposta > totalRegistro").text());

                    if (!totalRegistro) {
                        section[0].find("h3").text(mensagem += ` Não há cheques sem fundo.`);
                        return;
                    }

                    let qteOcorrencias = $(ret).find("BPQL > body > data > sumQteOcorrencias").text();

                    let v1 = moment($("dataUltOcorrencia", ret).text(), "DD/MM/YYYY"),
                        v2 = moment($("ultimo", ret).text(), "DD/MM/YYYY");

                    mensagem += ` Total de registros CCF: ${qteOcorrencias} com data da última ocorrência: ${(v1.isAfter(v2) ? v1 : v2).format("DD/MM/YYYY")}.`;
                    section[0].find("h3").text(mensagem);
                    section[0].addClass("warning");

                    $(ret).find("BPQL > body list > *").each((k, v) => {

                        for (let check of task[1]) {
                            let cmc = new CMC7Parser(check.cmc),
                                agency = $("agencia", v).text().replace(/^[0]+/, ''),
                                bank = $("banco", v).text().replace(/^[0]+/, '');

                            if (agency == cmc.agency.replace(/^[0]+/, '') &&
                                bank == cmc.bank.replace(/^[0]+/, '')) {
                                section[0].removeClass("warning").addClass("critical");
                            }
                        }

                    });

                    section[1].append(controller.call("xmlDocument", ret));
                }
            });

        }

        controller.server.call("SELECT FROM 'IEPTB'.'WS'", {
            data: {
                documento: task[0]
            },
            success: (ret) => {
                if ($(ret).find("BPQL > body > consulta > situacao").text() != "CONSTA") {
                    section[0].find("h3").text(mensagem += ` Não há protestos.`);
                    return;
                }
                let totalProtestos = $("protestos", ret)
                    .get()
                    .map((p) => parseInt($(p).text()))
                    .reduce((a, b) => a + b, 0);
                section[0].find("h3").text(mensagem += ` Total de Protestos: ${totalProtestos}.`);
                section[0].addClass("warning");
                section[1].append(controller.call("xmlDocument", ret));
            }
        });

        let ccbuscaQuery = {
            documento: task[0]
        };

        if (CNPJ.isValid(task[0])) {
            ccbuscaQuery['q[0]'] = "SELECT FROM 'CCBUSCA'.'CONSULTA'";
            ccbuscaQuery['q[1]'] = "SELECT FROM 'RFB'.'CERTIDAO'";
        }

        controller.server.call("SELECT FROM 'CCBUSCA'.'CONSULTA'", {
            cache: true,
            data: ccbuscaQuery,
            success: function(ret) {
                let xmlDocument = null,
                    icon = $("<i />").addClass("fa fa-user-plus"),
                    showing = false;

                section[2].prepend($("<li />").append(icon)
                    .attr("title", "Informações do Sacado"));

                section[2].find(".action-resize i").click(function() {
                    if (!$(this).hasClass("fa-plus-square-o")) {
                        icon.removeClass("fa-user-times");
                        icon.addClass("fa-user-plus");
                        xmlDocument.remove();
                        showing = false;
                    }
                });

                icon.click((e) => {
                    e.preventDefault();
                    if (!showing) {
                        xmlDocument = controller.call("xmlDocument", ret);
                        section[2].find(".fa-plus-square-o").click();
                        icon.addClass("fa-user-times");
                        icon.removeClass("fa-user-plus");
                        result.element().prepend(xmlDocument);
                    } else {
                        icon.removeClass("fa-user-times");
                        icon.addClass("fa-user-plus");
                        xmlDocument.remove();
                    }
                    showing = !showing;
                });
            },
            error: function() {
                result.content().prepend(result.addItem("Documento", task[0]));
            },
            complete: function() {
                section[0].removeClass("loading");
            }
        });

        return section[0];
    };

    controller.registerCall("icheques::resultDatabase", function(databaseResult) {
        if (!databaseResult) {
            return [{
                columns: [],
                values: []
            }];
        }

        _.each(databaseResult.columns, function(item, i, list) {
            list[i] = changeCase.camelCase(item);
        });

        _.each(databaseResult.values, function(item, i, list) {
            list[i] = _.object(databaseResult.columns, item);
        });

        return databaseResult;
    });

    controller.registerCall("icheques::show::query", function(query, callback, element) {
        if (!query) {
            return;
        }
        controller.call("icheques::resultDatabase", query);
        controller.call("icheques::show", query.values, callback, element);
    });

    controller.registerCall("icheques::show", function(storage, callback, element, scrollTo = false) {
        var documents = _.pairs(_.groupBy(storage, function(a) {
            return a.cpf || a.cnpj;
        }));

        var moreResults = controller.call("moreResults", 5);
        moreResults.callback((cb) => {
            cb(_.map(documents.splice(0, documents.length > 5 ? 5 : documents.length), showDocument));
        });

        $(element || ".app-content").append(moreResults.element());
        if (scrollTo) $('html, body').animate({scrollTop: moreResults.element().offset().top}, 2000);

        moreResults.show();

        if (callback) {
            callback();
        }
    });

    controller.registerCall("icheques::item::delete", function(cmc) {
        var node = $(".cmc-" + cmc);
        if (!node.length) {
            return;
        }

        var removeItem = node.data("delete");
        if (typeof removeItem !== "function") {
            return;
        }

        removeItem();
    });

    controller.registerCall("icheques::item::upgrade", function(item) {
        var node = $(".pushid-" + item.pushId);
        if (!node.length) {
            return;
        }

        var upgrade = node.data("upgrade");
        if (typeof upgrade !== "function") {
            return;
        }

        upgrade(item);
    });

    controller.registerTrigger("serverCommunication::websocket::ichequeUnset", "icheques::pushDelete", function(data, callback) {
        callback();

        controller.database.exec(squel
            .delete()
            .from("ICHEQUES_CHECKS")
            .where("CMC = ?", data).toString());

        controller.call("icheques::item::delete", data);
        controller.trigger("icheques::deleted", data);
    });
};
