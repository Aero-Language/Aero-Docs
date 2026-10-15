# AeroPackage Specification
The AeroPackage standard is a file standard that describes how a package is structured and what it can contain.


## Structure
An AeroPackage is an archive that is very adaptable and is used somewhat differently depending on context.

For example, a Luft Compiler Plugin is also an AeroPackage. 
Just like the main way of loading Plugins uses the AeroPackage format as well.

This is how an AeroPackage is structured.

```tree
package.aeropkg
├─/ assets
├─/ package
├── manifest.json
└── README.md
```

|     Path      |                             Explanation                             |Optional |
|---------------|---------------------------------------------------------------------|---------|
|`/assets`      |Assets for the package like images/icons                             |    ✔️   |
|`/package`     |The actual files for the package like binaries                       |    ❌️   |
|`manifest.json`|Describes what type of package it is and where to find certain things|    ❌️   |
|`README.md`    |The README from github or                                            |    ✔️   |


## Manifest
The manifest describes what exactly the package is for and other metadata for the AeroPackage.

This is how it could look like.
```jsonc
{
  // Necessary information
  "manifest_version": 1,
  "package_type": "#lcp", // Stands for Luft Compiler Plugin in this case
  "package_id": "@aero/builtin",

  // Metadata (Optional, but highly encouraged)
  "name": "Aero Built-in Language Features",
  "version": "1.0.0",
  "authors": [
    "Aero-Language" // Preferably the github username
  ],
  "description": "...",
  "source": "https://www.github.com/Aero-Language/...",

  // PackageType specific metadata goes here
  "meta": {
    "compiler_version": "1.0.2",
    "plugin_type": "#builtin",
    // ...
  }
}
```

### Common Conventions
Id's should start with `@` and the identifiers should be seperated by `/` and written in lowercase.<br>Type's should start with a `#` and then a lowercase identifier.
