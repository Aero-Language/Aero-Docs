# AeroLibrary Specification
An AeroLibrary is an AeroPackage of the type `#lib`. It carries a compiled library plus *headers*: pretty printed Aero files that only name what the library offers, so the compiler never has to analyse a binary to find out what is inside.

The extension of a library package is `.aerolib`. The AeroPackage standard allows an application to pick its own extension, `.aeropkg` stays the default.


## Structure
```tree
mylib.aerolib
├─/ assets
├─/ package
│  ├─/ headers
│  └─/ bin
│     └─/ <rid>
├── manifest.json
└── README.md
```

|        Path         |                              Explanation                               |Optional |
|---------------------|------------------------------------------------------------------------|---------|
|`/package/headers`   |The header files, one or more `.aero` files                             |    ❌️   |
|`/package/bin/<rid>` |The shared library for one platform, `<rid>` is a runtime identifier    |    ❌️   |

A package can hold several `<rid>` folders. The compiler picks the one that matches the target platform.

| Runtime id  |          File          |
|-------------|------------------------|
|`linux-x64`  |`libname.so`            |
|`osx-arm64`  |`libname.dylib`         |
|`win-x64`    |`name.dll` + `name.lib` |


## Manifest
```jsonc
{
  "manifest_version": 1,
  "package_type": "#lib",
  "package_id": "@scope/name",

  "name": "My Library",
  "version": "1.0.0",
  "authors": ["Aero-Language"],
  "description": "...",
  "source": "https://www.github.com/Aero-Language/...",

  "meta": {
    "luft_version": "1.0.2",
    "abi": 1,
    "modules": ["Game.Core", "Game.Util"],
    "headers": "package/headers",
    "binaries": {
      "linux-x64": "package/bin/linux-x64/libname.so",
      "win-x64": "package/bin/win-x64/name.dll"
    },
    "dependencies": [
      { "id": "@aero/std", "version": "^1.0.0" }
    ]
  }
}
```

|     Field      |                                   Explanation                                    |
|----------------|----------------------------------------------------------------------------------|
|`luft_version`  |The compiler version that built the library                                       |
|`abi`           |Integer, raised on every change that breaks the binary interface (see below)      |
|`modules`       |Every module the headers declare                                                  |
|`headers`       |Folder with the header files, relative to the package root                        |
|`binaries`      |The shared library per runtime id                                                 |
|`dependencies`  |Other `#lib` packages the library calls, the consumer links them as well          |

A consumer refuses a library whose `abi` it does not know.


## Headers
Headers exist for the type checker and the language server only. They contain no code, no layouts and nothing the binary already knows.

A header file is a normal Aero file that was pretty printed from the library's source, with these rules.

### What stays
- `module` declarations and `import` statements
- Every `public` class, struct, record, trait, enum and annotation, with its name, generic parameters, listed base types and traits
- Every `public` function, operator, property, field, constructor, extension and constant, with name, parameter names and types, return type and modifiers
- The modifiers that change how something is used: `static`, `const`, `virtual`, `abstract`, `impl`, `sealed`, `ref`, `weak` and the access modifier
- Annotations that are part of the public API

### What goes
- Function, accessor, constructor and destructor bodies
- Default values of parameters, fields and properties
- The bodies of generic declarations, see *Generics*
- Everything that is not `public`: private and internal members and types
- Backing fields, field layout, sizes, alignment and vtable order
- Comments, except documentation comments

A function without a body is written with a terminating `;`.

```aero
module Game.Core

public class Player {
    public var Name: String
    public constructor(name: String)
    public fun Heal(amount: Int);
    public virtual fun Describe() -> String;
}
```

### Default parameters
A default value is code, so it does not appear in a header. A function with defaults is printed once per accepted argument count instead, as plain overloads. The library exports an entry point for every one of them.

### Generics
A generic body is code, so it does not appear in a header either: only the signature is printed. A consumer cannot instantiate a generic declaration from a header.

A library that wants to offer a generic type or function has to name the instantiations it ships, with an `export` list in its source. Those instantiations are compiled into the binary and printed into the headers as concrete declarations, e.g. `Box<Int>`.


## Binary
### Symbols
Every `public` declaration is an exported symbol. The names follow the C naming scheme of the compiler: module dots become `_`, then the type, then the member (`Game_Core_Player_Heal`), overloads get a parameter type suffix. Internal and generic helpers are never exported.

### Objects and layouts
The consumer does not know how an object is laid out, because headers do not say. A library therefore exports everything that touches memory directly:

- A class constructor exported as `<Type>_New[_params]` allocates and initializes the object and returns it
- Fields are read and written through exported accessor functions `get_<Name>` / `set_<Name>`
- A struct or record exports `<Type>_Size()` and `<Type>_Align()`, the consumer allocates that much and calls the constructor function on it
- A consumer type cannot derive from a library class or implement a library struct as a base

### Initialization
Every library exports `<package_id>_aero_init`, with `@` and `/` written as `_`. It sets up statics and module level fields, and it is safe to call more than once. A consumer calls the init functions of all libraries it links, dependencies first, before its own code runs.

### Runtime
The C runtime (memory management, strings, arrays, argv) is linked into every library. Its symbols are hidden, so two libraries never clash. Memory is allocated and released by the runtime of the library that owns it, which is why objects cross the boundary only through the exported functions above.


## Consuming a library
1. The compiler reads the `manifest.json` and checks `package_type`, `abi` and the runtime id
2. It parses the headers as library modules and runs the type checker over them next to the project's own files
3. Code generation declares every library function as an external function and emits no bodies for it
4. The linker receives the shared library of each package, and the compiler calls the init functions before `Main`

In a single output build the library's shared library is still linked as it is, the headers only replace its source.


## Building a library
`luft` builds a library from the project files:

1. Check and compile the sources like an executable, without `Main` and without a C `main`
2. Export every `public` symbol, add the accessors, constructors and size functions from above, and the init function
3. Print the headers from the checked sources, with the rules from the *Headers* section
4. Link the shared library and write the archive with the manifest


## Versioning
|        Change         |Raises `abi`|
|-----------------------|------------|
|New public member      |      ❌️    |
|Changed signature      |      ✔️    |
|Removed public member  |      ✔️    |
|Changed object memory  |      ❌️    |
|Runtime interface      |      ✔️    |

Objects are opaque to the consumer, so a library can change the memory layout of its own types without breaking anyone.
