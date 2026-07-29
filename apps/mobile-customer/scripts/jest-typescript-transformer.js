const ts = require('typescript');

module.exports = {
  process(sourceText, sourcePath) {
    const result = ts.transpileModule(sourceText, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2021,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
        sourceMap: true,
      },
      fileName: sourcePath,
      reportDiagnostics: true,
    });

    const errors = (result.diagnostics || []).filter(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
    );
    if (errors.length > 0) {
      throw new Error(
        errors
          .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
          .join('\n'),
      );
    }

    return { code: result.outputText, map: result.sourceMapText || undefined };
  },
};
