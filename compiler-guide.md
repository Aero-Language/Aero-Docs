# Building Aero

**Companion Guide · Unofficial**

A practical guide to implementing a lexer, parser, and compiler backend for the Aero language — tokenization rules, AST shape, and the LLVM codegen pipeline.

---

## 01 · Lexer (Tokenization)

The lexer turns raw Aero source text into a flat stream of tokens the parser consumes. It has no knowledge of grammar — only of character patterns.

### Token Types

| Token | Example | Rule |
| --- | --- | --- |
| Keyword | `val`, `defer`, `extension` | Exact match against the reserved word list |
| Identifier | `stepLimit`, `FileConfig` | Letter/underscore, then letters/digits/underscores |
| IntLiteral | `200`, `1024` | Digits only |
| FloatLiteral | `3.14` | Digits, `.`, digits |
| StringLiteral | `"Hello, Aero!"` | Double-quoted, backslash-escaped |
| Operator | `==`, `=>`, `+=` | Longest-match against the operator set |
| Punctuation | `(` `)` `{` `}` `,` `.` | Single structural characters |
| Comment | `// note`, `/* note */` | Discarded, never emitted as a token |
| EOF | — | Emitted once at end of input |

### Required Regex Patterns

```text
Identifier      [A-Za-z_][A-Za-z0-9_]*
IntLiteral      \d+
FloatLiteral    \d+\.\d+
StringLiteral   "(?:[^"\\]|\\.)*"
LineComment     //[^\n]*
BlockComment    /\*[\s\S]*?\*/
Operator        ==|!=|<=|>=|=>|\+=|-=|&&|\|\||[+\-*/%=<>!]
Punctuation     [(){}\[\],.:]
Semicolon       ;
```

### Keyword Set

`val` · `var` · `if` · `else` · `return` · `class` · `struct` · `extension` · `public` · `private` · `protected` · `static` · `defer` · `alloc` · `free` · `ref` · `match` · `self` · `get` · `set` · `true` · `false`

Anything matching the Identifier pattern that is not in this set is emitted as an Identifier token — keywords are a lookup after the fact, not a separate grammar rule.

### Lexing Algorithm

- **Maximal munch.** At each position, try every token pattern and keep the longest match — this is why `==` must be attempted before `=`, and `<=` before `<`.
- **Whitespace and comments are skipped**, not tokenized.
- **Track line and column** on every token for error messages and source maps.

```text
function NextToken():
    SkipWhitespaceAndComments()
    if AtEnd(): return Token(EOF)
    for pattern in OrderedPatternList:
        match = TryMatch(pattern, position)
        if match: return EmitToken(pattern.kind, match)
    error("Unexpected character")
```

---

## 02 · Parser (AST Construction)

The parser is a recursive-descent parser with precedence climbing for binary expressions — needed because `if` and `match` are expressions, not statements, and can appear anywhere a value is expected.

### AST Node Tree

```text
Node
- Program
- Declaration
  - FunctionDecl        (name, params, returnType, body)
  - StructDecl          (name, fields, methods, annotations)
  - ClassDecl           (name, fields, properties, methods, destructor)
  - PropertyDecl        (name, type, getter, setter)
  - ExtensionDecl       (targetType, methods)
- Statement
  - VarDeclStmt         (mutability: val|var, type, name, init)
  - ExpressionStmt
  - DeferStmt           (statement)
  - EmptyStmt           (;;)
- Expression
  - IfExpr              (condition, thenBranch, elseBranch)
  - MatchExpr           (subject, arms)
  - BinaryExpr          (left, operator, right)
  - UnaryExpr           (operator, operand)
  - CallExpr            (callee, args, trailingLambda)
  - MemberExpr          (target, member)
  - AssignExpr          (target, value)
  - LambdaExpr          (params, body)
  - Literal             (kind: int|float|string|bool, value)
  - Identifier          (name)
```

### Grammar (EBNF-ish)

```text
Program        := Declaration*
Declaration    := FunctionDecl | StructDecl | ClassDecl | ExtensionDecl
FunctionDecl   := "public"|"private" Type Identifier "(" Params ")" Block
Block          := "{" Statement* "}"
Statement      := VarDecl | DeferStmt | ExpressionStmt | ";;"
VarDecl        := ("val"|"var") Type Identifier "=" Expression
Expression     := IfExpr | MatchExpr | Assignment
IfExpr         := "if" "(" Expression ")" Expression "else" Expression
MatchExpr      := "match" "(" Expression ")" "{" MatchArm ("," MatchArm)* "}"
Assignment     := Equality ("=" Assignment)?
Equality       := Comparison (("=="|"!=") Comparison)*
Comparison     := Additive (("<"|">"|"<="|">=") Additive)*
Additive       := Multiplicative (("+"|"-") Multiplicative)*
Multiplicative := Unary (("*"|"/"|"%") Unary)*
Unary          := ("!"|"-")? Postfix
Postfix        := Primary ("." Identifier | "(" Args ")")*
Primary        := Literal | Identifier | "(" Expression ")" | TrailingLambda
```

### Key Parsing Rules

- **Expression-first — if and match return values.** Every branch of an `if` or `match` expression must parse to the same static type; the parser defers that check to semantic analysis but must preserve both branches in the AST.
- **Precedence climbing for binary ops.** Comparison binds looser than additive, which binds looser than multiplicative — implement as a chain of mutually-recursive functions, or a single precedence-climbing loop with a binding-power table.
- **Trailing lambda desugaring.** When a call's last parameter is a function type and the next token is a `{` rather than `(`, parse a block as an implicit final argument.
- **Statement-list boundaries.** A block reads statements until a semicolon or a closing brace. For a bare newline, the parser decides whether it terminates the current statement — track an open-bracket depth and whether the previous token was a binary operator; only treat the newline as a separator when the depth is zero and the last token wasn't one.

---

## 03 · Compiler (LLVM Codegen)

Aero compiles straight to LLVM IR, then to native code through LLVM's own backend — the compiler's own job stops at emitting well-typed IR.

### Pipeline

| Stage | Input → Output | Responsible for |
| --- | --- | --- |
| Lexing | Source text → Tokens | Tokenization (see 01) |
| Parsing | Tokens → AST | AST construction (see 02) |
| Semantic Analysis | AST → Typed AST | Casing rules, type checking, val reassignment errors |
| Ownership Pass | Typed AST → Annotated AST | Resolves ref bindings for structs, matches every struct alloc to a free or defer (classes go to the ARC pass instead, see 04) |
| ARC Pass | Typed AST → Annotated AST | Injects retain/release around every class reference (see 04) |
| IR Generation | Annotated AST → LLVM IR | One IR function per Aero function, structs as LLVM struct types |
| Optimization | LLVM IR → LLVM IR | Standard LLVM passes (mem2reg, inlining, dead-code elimination) |
| Native Codegen | LLVM IR → Machine code | LLVM's target backend (x86-64, ARM64, and others) |

### Needed Components

`Symbol Table` · `Type Checker` · `Ownership Checker` · `LLVM IR Builder` · `Target Machine` · `Diagnostics Emitter`

### Semantic Analysis Checks

- **Casing enforcement.** Reject a type, function, or public property name that is not PascalCase; reject a local variable or private field that is not camelCase.
- **Immutability.** A `val` binding may be assigned once, at declaration; any later assignment is a compile error.
- **Struct vs. class layout.** Structs are stack-allocated value types unless behind `ref`, and every struct `alloc` must be reachable by a matching `free` or `defer free(...)` on all exit paths. Classes are always heap-allocated and never use `alloc`/`free` directly — see 04 for their ARC lifecycle instead.

### Compiling defer

**Cleanup at every exit — defer is not a runtime callback.** The compiler collects deferred statements per scope and emits them, in reverse order, immediately before every return and at the closing brace of that scope — there is no hidden closure or stack unwinding at runtime, just duplicated cleanup code inserted at compile time.

```text
function EmitBlock(block):
    deferred = []
    for stmt in block.statements:
        if stmt is DeferStmt: deferred.push(stmt.inner)
        else: Emit(stmt)
        if stmt is ReturnStmt:
            for d in reverse(deferred): Emit(d)
    for d in reverse(deferred): Emit(d)
```

### Struct Copy vs. Reference

`Pass by value` · `Pass by ref` · `Heap via alloc`

Codegen must decide, per call site, whether a struct argument is copied onto the callee's stack frame (the default), passed as a pointer under `ref` (no copy, including the implicit `self` in instance methods), or already living on the heap behind a `ref T` from `alloc`. A class argument never faces this decision — it is always an implicit reference, retained on the way in and released on the way out (see 04).

---

## 04 · Automatic Reference Counting (ARC)

Structs stay fully manual — `alloc`, `free`, `defer` compile exactly as described in 03. Classes get the same zero-GC guarantee through a different mechanism: the compiler injects retain/release calls around every class reference, so the developer never writes `alloc` or `free` for a class.

### Class Memory Layout

```text
+-------------------+-------------------+-------------------+
| Ref Count (64-bit)| Field: Name       | Field: Score      |
| Internal header   | Public property   | Private field     |
+-------------------+-------------------+-------------------+
```

- **Initial state.** A newly allocated class instance starts with Ref Count = 1.
- **Retain.** Increment Ref Count by 1.
- **Release.** Decrement Ref Count by 1; if it reaches 0, invoke `~TypeName()` and return the instance to the allocator.

### Compiler-Injected Rules

**Rule 1 — Constructor calls allocate.** A class constructor call lowers to a heap allocation plus an initial reference count of 1; the developer's source never mentions `alloc`.

```aero:developer writes
val Player hero = Player("Aero")
```

```aero:compiler lowers to
ref Player hero = __aero_class_alloc<Player>()
Player.ctor(hero, "Aero")
```

**Rule 2 — Copy assignment retains.** Assigning an existing class reference, or passing it as an argument, emits a retain call.

```aero:developer writes
val Player partyMember = hero
```

```aero:compiler lowers to
val Player partyMember = hero
__aero_retain(partyMember) // Ref Count = 2
```

**Rule 3 — Scope exit releases.** Local class references are released when their scope ends, and reassigning a `var` releases the old value first.

```aero:developer writes
public Void ProcessPlayer() {
    val Player p = Player("Enemy")
    p.TakeDamage(50)
}
```

```aero:compiler lowers to
public Void ProcessPlayer() {
    val Player p = Player("Enemy")
    p.TakeDamage(50)
    __aero_release(p)
}
```

### Weak References

`weak` prevents reference cycles — a parent/child pair that would otherwise keep each other alive forever. A `weak` field is excluded from retain/release entirely, and reads back `null` once its target has actually been freed.

```aero
public class Node {
    public String Value { get; set; }
    public Node Next { get; set; }
    public weak Node Parent { get; set; }
}
```

### Full Lowering Example

```aero:developer writes
public class GameSession {
    public Player ActivePlayer { get; set; }

    public GameSession(String playerName) {
        self.ActivePlayer = Player(playerName)
    }

    public Void Run() {
        val Player p = self.ActivePlayer
        p.Play()
    }
}

public Void Main() {
    val GameSession session = GameSession("Alex")
    session.Run()
}
```

```aero:compiler lowers to
public Void GameSession.Run(ref GameSession self) {
    ref Player p = self.ActivePlayer
    __aero_retain(p)
    Player.Play(p)
    __aero_release(p)
}

public Void Main() {
    ref GameSession session = __aero_class_alloc<GameSession>()
    GameSession.ctor(session, "Alex")
    GameSession.Run(session)
    __aero_release(session) // triggers ~GameSession(), which releases ActivePlayer
}
```

### Ownership Pass vs. ARC Pass

- **Struct vs. class dispatch.** The ownership pass (03) only walks `alloc`/`free`/`defer` chains for structs — class references are exempt and handed to the ARC pass instead.
- **self passing stays the same.** Class methods still receive `self` as a `ref`; ARC governs the object's lifetime, not its calling convention.

---

*This is a companion engineering guide to the Aero language specification — implementation details here are suggested, not normative.*
