module.exports = `
/* ==========================================================================
   Normatização CSS IMPRESSÃO
   ========================================================================== */

html,
button,
input,
select,
textarea {
    color: #444;
}

body {
    font-size: 62.5%;
}

img {
    vertical-align: middle;
}

fieldset {
    border: 0;
    margin: 0;
    padding: 0;
}

textarea {
    resize: vertical;
}

/* ==========================================================================
   Estilos Principais
   ========================================================================== */

body {
    font-family: Helvetica, Arial, sans-serif;
    background: #f8f8f8;
}

.wrap{
    margin: 0 auto;
    width: 660px;
    color: #444;
}


h1 {
    font-size: 3.2em;
}

h2 {
    font-size: 2.4em;
    margin-top: 2em;
}

h3 {
    font-size: 1.8em;
    margin-top: 2em;
}

h1 a {
    text-decoration: none;
    color: #057ac5;
}

p {
    font-size: 1.6em;
    line-height: 2.1em;
}

a {
    color: #057ac5;
    text-decoration: none;
}

a:hover {
    text-decoration: underline;
}

figure img {
    margin-bottom: 2em;
}

.header {
    background: #000;
    margin: 0 auto;
    width: 100%;
    padding-top: 2em;
    padding-bottom: 2em;
    position: relative;
    overflow: hidden;
}

.header h1 {
    color: #FFF;
    font-size: 1.6em;
    width: 240px;
    float: left;
    display: block;
    margin: 0;
    padding: 0;
}

.menu ul {
    float: right;
    width: 420px;
    margin: 0;
    padding: 0;
}

.menu li {
    display: inline-block;
    margin-right: 2em;
}

.menu a {
    font-size: 1.4em;
}

.artigo {
    margin-top: 4em;
}

.footer {
    background: #000;
    padding: 1.5em 0 1.5em 0;
    margin-top: 4em;
    width: 100%;
}

.footer small {
    color: #CCC;
    font-size: 1.2em;
    line-height: 1.5em;
    width: 640px;
    margin: 0 auto;
    display: block;
}


.no-print {
    display: block;
}

.print {
    display: none;
}



/* ==========================================================================
   Estilos para impressão
   ========================================================================== */

@media print {

    * {
        background: transparent !important;
        color: #000 !important;
        text-shadow: none !important;
        filter:none !important;
        -ms-filter: none !important;
    }

    body {
        margin:0;
        padding:0;
        line-height: 1.4em;
        font: 12pt Georgia, "Times New Roman", Times, serif;
        color: #000;
    }

    @page {
        margin: 1.5cm;
    }

    .wrap {
        width: 100%;
        margin: 0;
        float: none !important;
    }

    .no-print, nav, footer, video, audio, object, embed {
        display:none;
    }

    .print {
        display: block;
    }

    img {
        max-width: 100%;
    }

    aside {
        display:block;
        page-break-before: always;
    }

    h1 {
        font-size: 24pt;
    }

    h2 {
        font-size: 18pt;
    }

    h3 {
        font-size: 14pt;
    }

    p {
        font-size: 12pt;
        widows: 3;
        orphans: 3;
    }

    a, a:visited {
        text-decoration: underline;
    }

    a:link:after, a:visited:after {
        content: " (" attr(href) ") ";
    }

    p a {
        word-wrap: break-word;
    }

    q:after {
        content: " (" attr(cite) ")"
    }

    a:after, a[href^="javascript:"]:after, a[href^="#"]:after {
        content: "";
    }

    .page-break {
        page-break-before: always;
    }

    /*Estilos da Demo*/
    .header.print h1{
        width: 100%;
        margin-bottom: 0.5cm;
        font-size: 18pt;
    }

    .header.print:after {
        content: "Este artigo foi escrito pela designer Dani Guerrato e retirado do site Tableless.";
    }

    .artigo {
        margin-top: 0;
        border-top: 1px solid #000;
        padding-top: 1cm;
    }

    h1 a:link:after, h1 a:visited:after {
        content: "";
    }
}`;
