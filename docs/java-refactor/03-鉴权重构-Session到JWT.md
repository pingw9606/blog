# 03 · 鉴权重构：Session Cookie → JWT

旧项目用 `nuxt-auth-utils` 的**加密 Cookie 会话**。前后端分离后改成 **Spring Security + JWT** 无状态鉴权——更适合 React SPA 跨域调用。

## 一、两种方式的区别

| | 会话 Cookie（旧） | JWT（新） |
|---|---|---|
| 状态 | 服务端/Cookie 存会话 | 无状态，token 自带信息 |
| 前端 | 浏览器自动带 Cookie | 手动带 `Authorization: Bearer <token>` |
| 适合 | 同域全栈 | 前后端分离 / 移动端 |

流程：登录成功 → 后端签发 JWT → 前端存起来（localStorage）→ 之后每个请求带 `Authorization` 头 → 后端过滤器校验 → 放行。

## 二、密码加密：BCrypt

```java
@Bean
public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
}
```

注册时 `passwordEncoder.encode(raw)`，登录时 `passwordEncoder.matches(raw, hash)`。**永远不存明文密码。**

## 三、签发与校验 JWT

用 `io.jsonwebtoken:jjwt`（0.12.x）：

```java
@Service
public class JwtService {
    private final SecretKey key;
    private final long expirationMs;
    public JwtService(@Value("${app.jwt.secret}") String secret,
                      @Value("${app.jwt.expiration-ms}") long expirationMs) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationMs = expirationMs;
    }
    public String generateToken(Long uid, String username, String role) {
        Date now = new Date();
        return Jwts.builder()
            .subject(username).claim("uid", uid).claim("role", role)
            .issuedAt(now).expiration(new Date(now.getTime() + expirationMs))
            .signWith(key).compact();
    }
    public String extractUsername(String token) {
        return Jwts.parser().verifyWith(key).build()
            .parseSignedClaims(token).getPayload().getSubject();
    }
}
```

> **坑**：`hmacShaKeyFor` 要求密钥**至少 32 字节**，太短会直接抛异常。生产用环境变量注入：`openssl rand -base64 48`。

## 四、把 User 接进 Spring Security

Spring Security 认账号要一个 `UserDetails` 和 `UserDetailsService`：

```java
public class AppUserDetails implements UserDetails {
    private final User user;
    public AppUserDetails(User u){ this.user = u; }
    public User getUser(){ return user; }
    @Override public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name()));
    }
    @Override public String getPassword(){ return user.getPasswordHash(); }
    @Override public String getUsername(){ return user.getUsername(); }
    @Override public boolean isEnabled(){ return user.getStatus() == UserStatus.active; }
    // 其余 isXxx 返回 true
}

@Service
public class AppUserDetailsService implements UserDetailsService {
    private final UserRepository repo;
    public AppUserDetailsService(UserRepository r){ this.repo = r; }
    @Override public UserDetails loadUserByUsername(String username) {
        return new AppUserDetails(repo.findByUsername(username)
            .orElseThrow(() -> new UsernameNotFoundException(username)));
    }
}
```

## 五、JWT 过滤器：每个请求校验一次

```java
@Component
public class JwtAuthFilter extends OncePerRequestFilter {
    // 省略构造器注入 jwtService / userDetailsService
    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String header = req.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            try {
                String username = jwtService.extractUsername(header.substring(7));
                if (username != null && SecurityContextHolder.getContext().getAuthentication() == null) {
                    UserDetails ud = userDetailsService.loadUserByUsername(username);
                    if (ud.isEnabled()) {
                        var auth = new UsernamePasswordAuthenticationToken(ud, null, ud.getAuthorities());
                        SecurityContextHolder.getContext().setAuthentication(auth);
                    }
                }
            } catch (Exception ignored) { /* token 无效则当匿名 */ }
        }
        chain.doFilter(req, res);
    }
}
```

## 六、安全配置：哪些公开、哪些要登录

```java
@Configuration
public class SecurityConfig {
    // ... 注入 jwtAuthFilter
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(c -> c.disable())                               // 无状态、不用 CSRF
            .cors(c -> c.configurationSource(corsSource()))       // 允许前端域
            .sessionManagement(s -> s.sessionCreationPolicy(STATELESS))
            .authorizeHttpRequests(a -> a
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                .requestMatchers("/api/auth/register", "/api/auth/login").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/auth/me").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/novels", "/api/novels/**",
                                 "/api/chapters/**", "/api/categories").permitAll()
                .anyRequest().authenticated())
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
```

> **坑 1**：CORS 一定要配，且允许前端来源；否则浏览器预检 OPTIONS 就被拦。
> **坑 2**：公开的只读接口要按 `HttpMethod.GET` 精确放行——`GET /api/chapters/{id}/comments` 公开，但 `POST` 发评论要登录。

## 七、三种角色的权限判断

细粒度权限（作者只能改自己的书）放在 Service/Controller 层判断，写个小工具对应旧的 `guards.ts`：

```java
final class CurrentUser {
    static User require(AppUserDetails p) {
        if (p == null) throw ApiException.unauthorized("请先登录");
        return p.getUser();
    }
    static User requireAuthor(AppUserDetails p) {
        User u = require(p);
        if (u.getRole() != Role.author && u.getRole() != Role.admin)
            throw ApiException.forbidden("没有操作权限");
        return u;
    }
}
```

Controller 里拿当前用户，用 `@AuthenticationPrincipal`：

```java
@PostMapping
public NovelView create(@Valid @RequestBody CreateNovelRequest req,
                        @AuthenticationPrincipal AppUserDetails principal) {
    return novelService.create(req, CurrentUser.requireAuthor(principal));
}
```

## 八、验证

用 curl 跑一遍（假设已连上库、有演示账号）：

```bash
# 登录拿 token
TOKEN=$(curl -s -X POST localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"account":"author1","password":"password123"}' | jq -r .token)

# 带 token 建书
curl -s -X POST localhost:8080/api/novels -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"title":"测试","category":"scifi"}'

# 不带 token → 403；reader 账号 → 403（权限不足）
```

> 小提示：Spring Security 对匿名访问受保护接口默认返回 **403**（不是 401）。想要 401 可自定义 `AuthenticationEntryPoint`，学习阶段可不折腾。

下一篇：[04 · 数据库与 Flyway 迁移](./04-数据库与Flyway迁移.md)。
