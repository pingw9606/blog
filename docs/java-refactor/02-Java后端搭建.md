# 02 · Java 后端搭建（Spring Boot + JPA + 分层）

从零搭出后端骨架：Maven 工程、JPA 实体（对应 Prisma model）、Repository、Service、Controller、DTO、统一异常。

## 一、Maven 工程与依赖

`pom.xml` 继承 Spring Boot 父 POM，Java 21：

```xml
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.5</version>
</parent>
<properties>
    <java.version>21</java.version>
</properties>
```

关键 starter：

```xml
<dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency>
<dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-data-jpa</artifactId></dependency>
<dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-security</artifactId></dependency>
<dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-validation</artifactId></dependency>
<dependency><groupId>org.postgresql</groupId><artifactId>postgresql</artifactId><scope>runtime</scope></dependency>
<dependency><groupId>com.h2database</groupId><artifactId>h2</artifactId><scope>runtime</scope></dependency>
```

> starter 对照：`web`≈express、`data-jpa`≈Prisma/ORM、`security`≈鉴权中间件、`validation`≈参数校验。

入口类：

```java
@SpringBootApplication
public class OuyangServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(OuyangServerApplication.class, args);
    }
}
```

## 二、枚举与实体（对应 Prisma model）

Prisma 的 `enum Role { reader author admin }` → Java 枚举：

```java
public enum Role { reader, author, admin }
```

Prisma 的 `model User` → JPA 实体。注意几点：

```java
@Entity
@Table(name = "users")                 // user 在部分数据库是保留字，用 users
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)  // 自增主键
    private Long id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Enumerated(EnumType.STRING)         // 枚举存字符串而不是序号
    @Column(nullable = false)
    private Role role = Role.reader;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;
    // getters / setters ...
}
```

关系用 `@ManyToOne`（Prisma 的 relation）：

```java
// Novel 里
@ManyToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "author_id", nullable = false)
private User author;
```

> **对照 Prisma**：`@id @default(autoincrement())` → `@Id @GeneratedValue(IDENTITY)`；`@unique` → `@Column(unique=true)`；`@relation` → `@ManyToOne + @JoinColumn`；`@default(now())` → `@CreationTimestamp`。
>
> **坑**：`@ManyToOne` 默认是 EAGER，容易触发多余查询，统一写 `fetch = LAZY`。

## 三、Repository：一行接口顶一堆 SQL

Spring Data JPA 靠**方法名**自动生成查询：

```java
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmail(String email);
    Optional<User> findByEmailOrUsername(String email, String username);
    boolean existsByEmail(String email);
}

public interface NovelRepository extends JpaRepository<Novel, Long> {
    Optional<Novel> findBySlug(String slug);
    List<Novel> findByStatus(PublishStatus status);
    List<Novel> findByStatusAndCategory(PublishStatus status, String category);
}
```

> `findByEmailOrUsername` 会翻译成 `where email = ? or username = ?`。方法名即查询，`JpaRepository` 自带 `save/findById/delete` 等。

## 四、DTO：别把实体直接丢给前端

用 `record` 定义请求/响应，既做参数校验，又避免把 `passwordHash` 泄露出去：

```java
public record RegisterRequest(
    @Email(message = "邮箱格式不正确") @NotBlank String email,
    @NotBlank @Size(min = 2, max = 20) String username,
    @NotBlank @Size(min = 6) String password
) {}

public record UserDto(Long id, String username, String email, String role, String status) {
    public static UserDto from(User u) {
        return new UserDto(u.getId(), u.getUsername(), u.getEmail(),
                u.getRole().name(), u.getStatus().name());
    }
}
```

## 五、Service：业务逻辑（对应旧 server/api）

旧的一个接口处理函数，对应现在 Service 的一个方法。例如"创建小说"：

```java
@Service
public class NovelService {
    private final NovelRepository novelRepository;
    // 构造器注入（推荐，不用 @Autowired 字段注入）
    public NovelService(NovelRepository novelRepository) { this.novelRepository = novelRepository; }

    @Transactional
    public NovelView create(CreateNovelRequest req, User author) {
        String slug = SlugUtil.ensureUnique(
            req.slug() != null ? req.slug() : req.title(),
            novelRepository::existsBySlug);
        Novel novel = new Novel();
        novel.setAuthor(author);
        novel.setTitle(req.title().trim());
        novel.setSlug(slug);
        // ...
        return NovelView.of(novelRepository.save(novel), 0L, novel.getUpdatedAt());
    }
}
```

## 六、Controller：REST 路由

旧的 `server/api/novels/index.post.ts` → 现在的一个 `@PostMapping`：

```java
@RestController
@RequestMapping("/api/novels")
public class NovelController {
    private final NovelService novelService;
    public NovelController(NovelService s) { this.novelService = s; }

    @GetMapping                                  // GET /api/novels
    public Map<String, Object> list(@RequestParam(required=false) String category,
                                    @RequestParam(defaultValue="updated") String sort) {
        return Map.of("novels", novelService.listPublished(category, sort));
    }

    @PostMapping                                 // POST /api/novels
    public NovelView create(@Valid @RequestBody CreateNovelRequest req,
                            @AuthenticationPrincipal AppUserDetails principal) {
        return novelService.create(req, principal.getUser());
    }
}
```

## 七、统一异常

旧项目用 `createError({ statusCode, statusMessage })`。这里用自定义异常 + 全局处理器：

```java
public class ApiException extends RuntimeException {
    private final HttpStatus status;
    public static ApiException notFound(String m){ return new ApiException(HttpStatus.NOT_FOUND, m); }
    // ...
}

@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(ApiException.class)
    public ResponseEntity<?> handle(ApiException ex) {
        return ResponseEntity.status(ex.getStatus())
            .body(Map.of("status", ex.getStatus().value(), "message", ex.getMessage()));
    }
}
```

## 八、跑起来

先看 [04 篇](./04-数据库与Flyway迁移.md) 配好数据源，就能：

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21   # macOS keg-only 时
mvn spring-boot:run
```

下一篇处理最容易踩坑的部分：[03 · 鉴权重构 Session→JWT](./03-鉴权重构-Session到JWT.md)。
