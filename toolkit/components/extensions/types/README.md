# PoC Type-Checking JavaScript Using JSDocs

## Intro

TypeScript can be used on plain JavaScript files documented with JSDoc comments
to check types without a build step.  This is a proof of concept to show
viability and benefits of doing this for a "typical" component.

* [Handbook: Type Checking JavaScript Files][handbook]
* [JSDoc Reference][jsdoc]

## New files

 * `tsconfig.json`: at the root of a TypeScript "project" configures how to find
   and check files.

 * `types/globals.ts`: defines available globals, types and various utilities.

 * `types/XPCShellContentUtils.sys.mts`: an example of type definitions file for
   an external module which was automatically generated by `tsc`.

## How to use and expectations

Mach now comes with a `ts` command for type checking code using the built-in
gecko typelibs:

```
mozilla-central $ ./mach ts check toolkit/components/extensions/
```

You can also use an editor which supports the [language server][langserv].
VSCode should pick it up automatically, but others like Vim might need
[some configuring][nvim].

Other than continuing to use JSDocs, trying to follow guidelines below, and
hopefully remembering to run `tsc` occasionally, for now there is explicitly
*no expectation* that all new code must be fully typed, or pass typecheck
on every commit.

If you are in a hurry, or run into a confusing type problem, feel free to
slap a @ts-ignore and/or ask for help from someone more familiar. Hopefully
as workflow gets better integrations, we all learn some typescript along
the way, and the whole process remains non-disruptive.

## Guidelines for type-friendly code

Using more modern and idiomatic code patterns can enable better type inference
by the TypeScript compiler.

These fall under 5 main categories:

 1) Declare and/or initialize all class fields in the constructor.
    * (general good practice)

 2) Use real getters and redefineGetter instead of defineLazyGetter.
    * (also keeps related code closer together)

 3) When extending, don't override class fields with getters, or vice versa.
    * https://github.com/microsoft/TypeScript/pull/33509

 4) Declare and assign object literals at the same time, not separately.
    * (don't use `let foo;` at the top of the file, use `var foo = {`)

 5) Don't re-use local variables unnecessarily with different types.
    * (general good practice, local variables are "free")

 6) Use `export` on individual classes instead of grouping into "namespaces".
    * (idiomatic/ergonomic/modern JS, grouping was a leftover from JSMs)

### @ts-ignore recommendations

*Don't* use `@ts-ignore` for class fields and function or method signatures.

*Feel free* to use it:
 * locally inside methods,
 * when the alternative is more noise than signal,
 * when doing so isn't preventing passthrough of type-inference through other
   parts of the codebase.


[handbook]: https://www.typescriptlang.org/docs/handbook/intro-to-js-ts.html

[jsdoc]: https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html

[download]: https://www.typescriptlang.org/download

[langserv]: https://github.com/typescript-language-server/typescript-language-server

[nvim]: https://www.reddit.com/r/neovim/comments/131l9cw/theres_another_typescript_lsp_that_wraps_the/
