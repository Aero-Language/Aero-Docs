# Aero

**v0.1.0-draft · Work In Progress**

A statically typed, natively compiled language — Kotlin and C#-level ergonomics, C and C++ execution speed. No virtual machine. No garbage collector.

---

## 01 · Overview & Philosophy

Aero is a modern, statically typed, natively compiled programming language. It is designed to combine the ergonomic, high-level syntax of Kotlin and C# with the raw execution speed and predictable memory control of C and C++. It compiles directly to LLVM IR and then to native machine code — no bytecode, no interpreter.

`Target: LLVM` · `Memory: Manual, Zero-GC` · `Stack-by-default`

### Core Tenets

- **No VM or GC — Direct to native.** Aero compiles straight to LLVM IR and native machine code. Memory is automatically released when it is not referenced anywhere anymore.
- **Predictable — No hidden costs.** No hidden allocations, runtime tracing, or GC pauses — what you write is what runs. The runtime inserts code predictably to free memory and manage threads.
- **Ergonomic — Familiar syntax.** Heavy borrowing from C# (properties, structured types) and Kotlin (expression-based control flow, trailing lambdas).
- **Safer memory — No raw pointers.** Aero abstracts raw pointer syntax (`*`, `&`, `->`, arithmetic) behind explicit `ref` types like C#.

---

## 02 · Quickstart

A short tour of what Aero code looks like, before the full reference below.

### Syntax Tour

Variables are explicitly typed and explicitly mutable. Functions and types are PascalCase; locals are camelCase. Control flow reads as an expression.

```aero
// Variables are explicitly typed and explicitly mutable
val stepLimit: Int = 200
var stepCount = 0

// Functions are always PascalCase
public fun Clamp(value: Int, max: Int) -> Int {
    return if (value > max) max else value
}

// Structs are stack-allocated value types
public struct Point {
    var X: Int // Properties in classes or structs are public by default
    var Y: Int
}
```

### Hello, Aero

Every program starts at a PascalCase `Main` function returning `Void`.

```aero
from Core.System import Print

public fun Main() { // RetrunType of Void is implicit here
    Print("Hello, Aero!")
}
```

### Installation

**Coming soon — No compiler yet.** Aero is a work-in-progress specification — there is no compiler or CLI to install today. Once a reference implementation lands, `luft build` and `luft run` steps will replace this note. *(Planned)*

---

## 03 · Lexical Structure

### Casing & Naming Conventions

Aero enforces a strict casing ruleset so a symbol's scope and behavior are communicated visually, with no need to check its declaration.

| Case | Applies to | Example |
| --- | --- | --- |
| PascalCase | Types & primitives | `Int`, `FileStream`, `Vector2` |
| (I)PascalCase | Traits(Interfaces) | `ISerializable` |
| PascalCase | Functions / methods (public or private) | `ProcessData()`, `Validate()` |
| PascalCase | Public properties & fields | `public Float X` |
| camelCase | Private / protected fields | `private Int retryCount` |
| camelCase | Local variables (block scope) | `val speed = 100` |

### Statement Termination

Aero is semicolon-optional, similar to Kotlin. A newline implicitly terminates a statement unless the parser is mid-continuation (an unclosed `(` `[` `{`, or right after a binary operator). Semicolons explicitly terminate statements, typically to place several on one line. A double semicolon `;;` is an explicit empty statement (NOP). They can also be used in places where a statement is expected to be, but it is not implemented yet.

```aero
x = 1; y = 2; z = 3
condition = true

if (condition) ;; /* TODO: ... */ else /* some implementation */
```

### Comments

Standard C-style comments: `// single-line` and `/* multi-line */`.

### Preprocessor & Annotations

Aero has no C-style preprocessor (`#ifdef`). Instead, compiler annotations using `@` apply directly to the AST.
These can be either for the parser:

`@Packed` · `@Inline` · `@NoDiscard`

Or they can be made:

```aero
public annotation SomeTag // The '@' is required here for readability purposes
```

They can also store values, though they are not mutable:

```aero
public annotation Entity {
    // please do not do this, its a really bad idea to use a single counter like this and not a UniqueList or similar

    private static val counter: Long = 0 // This counter is shared through all instances of this annotation as it is static

    public +Entity(id: Long? = null) { // This indicates a preassigned parameter that is not necessary to provide
        var actualId = if (id != null) id else counter + 1
        if (id <= counter) throw InvalidIdException($"The id: '{actualId}' has already been reserved.")

        EntityRegistry.Register(actualId)
    }
}

@Entity(0)
public class SomeEntity

val id = SomeCounter.Next()

@Entity(id) // The passed values HAVE to be constants, so this would throw a compiler error 
public class SomeOtherEntity
```

---

## 04 · Variables & Immutability

Declarations require an explicit mutability modifier followed by a C-style type. Syntax: `[val|var] Type identifier = expression`.

```aero
val maxSpeed = 200 // Immutable
var currentSpeed = 0 // Mutable
currentSpeed = 50 // Valid
// maxSpeed = 250 // Error: Cannot mutate val
```

- **val — Immutable.** Read-only after initialization. Reassigning is a compile error.
- **var — Mutable.** Can be reassigned freely within its scope.

---

## 05 · Types & Data Structures

### Primitives

All primitives are written in PascalCase.

| Type | Description |
| --- | --- |
| `Int` | 32-bit signed integer |
| `UInt` | 32-bit unsigned integer |
| `Long` | 64-bit signed integer |
| `ULong` | 64-bit unsigned integer |
| `Float` | 32-bit floating point |
| `Double` | 64-bit floating point |
| `Bool` | Boolean |
| `Char` | Single UTF-8 Character  |
| `String` | UTF-8 string slice / buffer |
| `Void` | Return type for functions returning nothing |

*(We are not planning on adding an 'Any' type or something similar)*

### Structs (Value Types)

Stack-allocated value types by default. Passing a struct or assigning it to a new variable copies it, unless passed by reference.

```aero
@Packed
public struct Point {
    var X: Int
    var Y: Int

    public +Point(Int x, Int y) {
        self.X = x
        self.Y = y
    }
}
```

### Records (Lightweight Value Types)

Records are pure immutable value types, they are not able to have methods or any executing code for that matter, but they can be the target of extensions.

```aero
public record Point(X: Int, Y: Int)
```


### Classes (Reference Types)

Classes support encapsulation and complex layouts. Instances are automatically heap-allocated — construction, copying, and scope exit are managed by the compiler's ARC. See §09 for the full model.

```aero
public class FileConfig {
    private var path: String // this can be unassigned as it 

    public Path: String {
        get => Core.System.GetAbsolutePath(path)
        set => path = value
    }

    private var retryBudgtet = 3

    public +FileConfig(String path) {
        self.path = path
    }
}
```

### C#-Style Properties

Properties provide getter/setter semantics backed by compiler-generated fields.

```aero
public class Player {
    // Auto-property
    public Name: String { get; set; }

    // Read-only externally, writable internally
    public Score: Int { get; private set; } = 0

    // Expression body property (derived value)
    public IsHighScore: Bool {
        get => self.Score > 1000
    }
}
```

---

## 06 · Functions & Methods

### Function Syntax

Functions always use PascalCase identifiers; parameters use C-style declaration (`Type name`).

```aero
public Int CalculateDamage(Int baseDamage, Bool isCritical) {
    val multiplier = if (isCritical) 2 else 1
    return baseDamage * multiplier
}
```

### The self Keyword

Aero does not use `this`. The universal instance keyword is `self`. When executing methods on structs, `self` is implicitly passed as a `ref`, preventing stack copies.

### Extension Methods

Extensions add methods to existing structs/recors/classes without inheritance. A single extension prefixes the method name with `Type.`; an extension block groups several.

```aero:single extension
public Int.IsEven: Bool()
    => self % 2 == 0
```

```aero:extension block
extension Vector2 {
    public Translate(Float dx, Float dy): Vector2 {
        self.X += dx // 'self' is a hidden ref Vector2
        self.Y += dy
    }

    public LengthSquared(): Float {
        return (self.X ^ 2) + (self.Y ^ 2)
    }
}
```

### Trailing Lambda Blocks

If a function's final argument is a lambda, the caller can omit the parentheses and use a trailing block — Kotlin-style.

```aero
// Declaration
public Task(block: (id: Int) => {}) { 
    block(Tasks.NewId())
}

// Usage
Task { id ->
    File.Read("config.json")
    PrintLn($"Reading config from Task: {id}")
}
```

---

## 07 · Control Flow (Expressions)

Control flow in Aero is expression-based, like Kotlin or Rust — this removes the need for a ternary operator.

### if Expressions

When assigning the result of an `if` expression, every branch must return the same type AND nullability, though non-nullable types can be assigned to nullables.

```aero
val status: String = if (code == 200) "OK" else "Error"

// Multi-line block expressions implicitly return the last statement
val Int modifier = if (value > 100) {
    Console.WriteLine("High value detected")
    return 10 // Return value
} else {
    2 // Return value | The return statement can be implicit
}
```

### match Expressions

Pattern-matching switch statement intended to replace traditional `switch`.

```aero
val String desc = match (status) {
    200 => "OK",
    404 => "Not Found",
    _ => "Unknown"
}
```

---

## 08 · Memory Management (Zero-GC)

Aero has no garbage collector. It avoids C/C++-style pointer arithmetic to keep memory safe and readable. This section covers `struct`s and `class`es. Instances are managed automatically by counting the references and automatically releasing  — see §09.

### Stack by Default

Variables and instances are allocated on the stack by default.

```aero
public Void Process() {
    Point p = Point(10, 20) // Stack allocated
} // 'p' is popped off the stack here
```

### The ref Keyword

Use `ref` to prevent struct copying or to mutate the original instance.

```aero
public Offset(ref Point p, Int dx, Int dy) {
    p.X += dx
    p.Y += dy
}

public Main() {
    Point pt = Point(10, 20)
    Offset(ref pt, 5, 5) // Explicitly passed by reference
}
```

### Destructors (RAII)

A destructor is defined with a `~` prefix. It runs automatically the moment its ARC reference count reaches zero (§09).

```aero
public class FileStream {
    public String Path { get; set; }

    public +FileStream(String path) {
        self.Path = path
        // Open file handle logic
    }

    public ~FileStream() {
        self.CloseHandle() // Automatically cleans up native resources
    }
}
```

---

## 09 · Reference Counting (ARC)

Instances are automaticly memory safety: the compiler injects deterministic retain and release calls around every reference, so instances behave as if `alloc`/`free` never existed.

### Struct vs. Class

| Attribute | struct | record | class |
| --- | --- | --- | --- |
| Allocation | Stack | Stack | Heap |
| Pass semantics | Value copy (unless `ref`) | Value copy (unless `ref`) | Implicit reference |
| Polymorphism | One Base struct + Any amount of Traits | One Base class + Any amount of Traits, virtual dispatch |

### Constructing a Class

**Implicit allocation — Calling a constructor allocates.** `val hero = Player("Aero")` heap-allocates the instance and sets its reference count to 1 — no `alloc` keyword, no `free`. *(Rule 1)*

```aero
val hero = Player("Aero")
```

### Retain, Release, and Scope Exit

- **Copy assignment retains.** Assigning an existing class reference to a new variable, or passing it as an argument, increments the reference count.
- **Scope exit releases.** When a variable holding a class reference goes out of scope — or a `var` is reassigned — the compiler decrements the reference count.
- **Zero triggers the destructor.** When a release brings the count to 0, the type's `~TypeName()` runs and the backing memory returns to the allocator.

```aero
public ProcessPlayer() {
    val p = Player("Enemy")
    p.TakeDamage(50)
} // p's reference count drops to 0 here — ~Player() runs
```

### Weak References

Two objects that reference each other can keep each other alive forever — a reference cycle. The `weak` modifier breaks the cycle: it does not add to the reference count, and reading a `weak` reference after its target is freed safely yields `null`, as such, weak references are required to be nullable.

```aero
public class Node {
    public Value: String { get; set; }
    public Next: Node { get; set; }        // Strong — keeps the next node alive
    public weak Parent: Node { get; set; } // Weak — does not keep the parent alive

    public +Node(String value) {
        self.Value = value
    }
}
```

`Strong reference` · `weak reference`

---

*Aero Language Specification · v0.2.1 · Work In Progress — unofficial docs, subject to change.*
