// Os tipos de CSS modules vêm do `next-env.d.ts`, que só existe depois do build.
declare module '*.module.css' {
    const classes: Record<string, string>
    export default classes
}
