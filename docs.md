# Aero

**v0.1.0-draft · Work In Progress**

A statically typed, natively compiled language — Kotlin and C#-level ergonomics, C and C++ execution speed. No virtual machine. No garbage collector.

---

## 01 · Overview & Philosophy

Aero is a modern, statically typed, natively compiled programming language. It is designed to combine the ergonomic, high-level syntax of Kotlin and C# with the raw execution speed and predictable memory control of C and C++. It compiles directly to LLVM IR and then to native machine code — no bytecode, no interpreter.

`Target: LLVM` · `Memory: Manual, Zero-GC` · `Stack-by-default`

### Core Tenets

- **No VM or GC — Direct to native.** Aero compiles straight to LLVM IR and native machine code. Memory management is entirely the developer's responsibility.
- **Predictable — No hidden costs.** No hidden allocations, runtime tracing, or GC pauses — what you write is what runs.
- **Ergonomic — Familiar syntax.** Heavy borrowing from C# (properties, structured types) and Kotlin (expression-based control flow, trailing lambdas).
- **Safer manual memory — No raw pointers.** Memory is manual, but Aero abstracts raw pointer syntax (`*`, `&`, `->`, arithmetic) behind explicit `ref` types and `alloc`.

---

## 02 · Quickstart

A short tour of what Aero code looks like, before the full reference below.

### Syntax Tour

Variables are explicitly typed and explicitly mutable. Functions and types are PascalCase; locals are camelCase. Control flow reads as an expression.

```aero
// Variables are explicitly typed and explicitly mutable
val Int stepLimit = 200
var Int stepCount = 0

// Functions are always PascalCase
public Int Clamp(Int value, Int max) {
    return if (value > max) max else value
}

// Structs are stack-allocated value types
public struct Point {
    public Int X
    public Int Y
}
```

### Hello, Aero

Every program starts at a PascalCase `Main` function returning `Void`.

```aero
public Void Main() {
    Console.WriteLine("Hello, Aero!")
}
```

### Installation

**Coming soon — No compiler yet.** Aero is a work-in-progress specification — there is no compiler or CLI to install today. Once a reference implementation lands, `aero build` and `aero run` steps will replace this note. *(Planned)*

---

## 03 · Lexical Structure

### Casing & Naming Conventions

Aero enforces a strict casing ruleset so a symbol's scope and behavior are communicated visually, with no need to check its declaration.

| Case | Applies to | Example |
| --- | --- | --- |
| PascalCase | Types & primitives | `Int`, `FileStream`, `Vector2` |
| PascalCase | Functions / methods (public or private) | `ProcessData()`, `Validate()` |
| PascalCase | Public properties & fields | `public Float X` |
| camelCase | Private / protected fields | `private Int retryCount` |
| camelCase | Local variables (block scope) | `val Int speed = 100` |

### Statement Termination

Aero is semicolon-optional, similar to Kotlin. A newline implicitly terminates a statement unless the parser is mid-continuation (an unclosed `(` `[` `{`, or right after a binary operator). Semicolons explicitly terminate statements, typically to place several on one line. A double semicolon `;;` is an explicit empty statement (NOP).

```aero
Int x = 1; Int y = 2; Int z = 3

doSomething();;
;; // Valid standalone empty statement line
```

### Comments

Standard C-style comments: `// single-line` and `/* multi-line */`.

### Preprocessor & Annotations

Aero has no C-style preprocessor (`#ifdef`). Instead, compiler annotations using `@` apply directly to the AST.

`@Packed` · `@Inline` · `@Target(OS.Windows)` · `@NoDiscard`

---

## 04 · Variables & Immutability

Declarations require an explicit mutability modifier followed by a C-style type. Syntax: `[val|var] Type identifier = expression`.

```aero
val Int maxSpeed = 200 // Immutable
var Int currentSpeed = 0 // Mutable
currentSpeed = 50 // Valid
// maxSpeed = 250 // Error: Cannot reassign val
```

- **val — Immutable.** Read-only after initialization. Reassigning is a compile error.
- **var — Mutable.** Can be reassigned freely within its scope.

---

## 05 · Types & Data Structures

### Primitives

All primitives are written in PascalCase.

| Type | Description |
| --- | --- |
| `Int` | 32- or 64-bit signed integer, depending on target |
| `Float` | 32-bit floating point |
| `Double` | 64-bit floating point |
| `Bool` | Boolean |
| `String` | UTF-8 string slice / buffer |
| `Void` | Return type for functions returning nothing |

### Structs (Value Types)

Stack-allocated value types by default. Passing a struct or assigning it to a new variable copies it, unless passed by reference.

```aero
@Packed
public struct Point {
    public Int X
    public Int Y

    public Point(Int x, Int y) {
        self.X = x
        self.Y = y
    }
}
```

### Classes (Reference Types)

Classes support encapsulation and complex layouts. Instances are automatically heap-allocated and reference-counted — construction, copying, and scope exit are managed by the compiler's ARC, not by manual `alloc`/`free`. See §09 for the full model.

```aero
public class FileConfig {
    public String Path { get; set; }
    private Int retryBudget = 3

    public FileConfig(String path) {
        self.Path = path
    }
}
```

### C#-Style Properties

Properties provide getter/setter semantics backed by compiler-generated fields.

```aero
public class Player {
    // Auto-property
    public String Name { get; set; }

    // Read-only externally, writable internally
    public Int Score { get; private set; } = 0

    // Expression body property (derived value)
    public Bool IsHighScore {
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
    val Int multiplier = if (isCritical) 2 else 1
    return baseDamage * multiplier
}
```

### The self Keyword

Aero does not use `this`. The universal instance keyword is `self`. When executing methods on structs, `self` is implicitly passed as a `ref`, preventing stack copies.

### Extension Methods

Extensions add methods to existing structs or primitives without inheritance. A single extension prefixes the method name with `Type.`; an extension block groups several.

```aero:single extension
public Bool Int.IsEven() {
    return self % 2 == 0
}
```

```aero:extension block
extension Vector2 {
    public Void Translate(Float dx, Float dy) {
        self.X += dx // 'self' is a hidden ref Vector2
        self.Y += dy
    }

    public Float LengthSquared() {
        return (self.X * self.X) + (self.Y * self.Y)
    }
}
```

### Trailing Lambda Blocks

If a function's final argument is a function type, the caller can omit the parentheses and use a trailing block — Kotlin-style.

```aero
// Declaration
public Task Async(Func<Void> block) { ... }

// Usage
val Task t = Async {
    File.Read("config.json")
}
```

---

## 07 · Control Flow (Expressions)

Control flow in Aero is expression-based, like Kotlin or Rust — this removes the need for a ternary operator.

### if Expressions

When assigning the result of an `if` expression, every branch must return the same type.

```aero
val String status = if (code == 200) "OK" else "Error"

// Multi-line block expressions implicitly return the last statement
val Int modifier = if (value > 100) {
    Console.WriteLine("High value detected")
    10 // Return value
} else {
    2 // Return value
}
```

### match Expressions *(Reserved for future spec)*

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

Aero has no garbage collector — the programmer owns the memory lifecycle. It avoids C/C++-style pointer arithmetic to keep manual memory safe and readable. This section covers `struct`s and raw manual allocations; `class` instances are managed automatically instead — see §09.

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
public Void Offset(ref Point p, Int dx, Int dy) {
    p.X += dx
    p.Y += dy
}

public Void Main() {
    Point pt = Point(10, 20)
    Offset(ref pt, 5, 5) // Explicitly passed by reference
}
```

### Explicit Heap Allocation

`alloc` places an object on the heap and returns a typed heap reference (`ref T`), used with plain dot notation instead of pointer dereferencing.

```aero
public Void ProcessData() {
    ref Buffer buf = alloc Buffer(1024)
    buf.Write("System initializing...")
    free(buf) // Must be explicitly freed to prevent leaks
}
```

### Scope Cleanup (defer)

`defer` delays a statement until the surrounding scope exits — deterministic cleanup, including on early returns.

```aero
public String LoadConfig(String path) {
    ref FileHandle handle = alloc FileHandle(path)
    defer free(handle) // Guaranteed to run when LoadConfig exits

    if (!handle.IsOpen) {
        return "{}" // free(handle) runs automatically here
    }

    return handle.ReadAllText() // free(handle) runs automatically here
}
```

`FileHandle` here is a `struct` — manual `alloc`/`free`/`defer` applies to structs and raw resources; a `class` never needs explicit `alloc` or `free` (§09).

### Destructors (RAII)

A destructor is defined with a `~` prefix. For a `struct`, it runs when a stack instance goes out of scope, or when a heap instance is explicitly `free`d. For a `class`, it runs automatically the moment its ARC reference count reaches zero (§09).

```aero
public class FileStream {
    public String Path { get; set; }

    public FileStream(String path) {
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

`struct` is manual, stack-bound, zero-overhead. `class` trades that for automatic memory safety: the compiler injects deterministic retain and release calls around every reference, so class instances behave as if `alloc`/`free` never existed.

### Struct vs. Class

| Attribute | struct | class |
| --- | --- | --- |
| Default allocation | Stack | Heap, via ARC |
| Pass semantics | Value copy (unless `ref`) | Implicit reference |
| Lifetime management | Manual (`alloc`/`free`/`defer`) | Automatic, compiler-injected ARC |
| Header overhead | 0 bytes | 8 bytes (reference count) |
| Polymorphism | Concrete only | Inheritance, virtual dispatch |

### Constructing a Class

**Implicit allocation — Calling a constructor allocates.** `val Player hero = Player("Aero")` heap-allocates the instance and sets its reference count to 1 — no `alloc` keyword, no explicit `free`. *(Rule 1)*

```aero
val Player hero = Player("Aero")
```

### Retain, Release, and Scope Exit

- **Copy assignment retains.** Assigning an existing class reference to a new variable, or passing it as an argument, increments the reference count.
- **Scope exit releases.** When a `val`/`var` holding a class reference goes out of scope — or a `var` is reassigned — the compiler decrements the reference count.
- **Zero triggers the destructor.** When a release brings the count to 0, the type's `~TypeName()` runs and the backing memory returns to the allocator.

```aero
public Void ProcessPlayer() {
    val Player p = Player("Enemy")
    p.TakeDamage(50)
} // p's reference count drops to 0 here — ~Player() runs
```

### Weak References

Two objects that reference each other can keep each other alive forever — a reference cycle. The `weak` modifier breaks the cycle: it does not add to the reference count, and reading a `weak` reference after its target is freed safely yields `null`.

```aero
public class Node {
    public String Value { get; set; }
    public Node Next { get; set; }        // Strong — keeps the next node alive
    public weak Node Parent { get; set; } // Weak — does not keep the parent alive

    public Node(String value) {
        self.Value = value
    }
}
```

`Strong reference` · `weak reference`

---

*Aero Language Specification · v0.1.0-draft · Work In Progress — unofficial docs, subject to change.*
