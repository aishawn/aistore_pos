package com.orithos.posapi;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.tenant.TenantHolder;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.util.List;

@Component
public class PosApiTokenFilter extends OncePerRequestFilter {
    private final PosApiTokenService tokens;
    private final ObjectMapper mapper;
    public PosApiTokenFilter(PosApiTokenService tokens, ObjectMapper mapper) { this.tokens=tokens; this.mapper=mapper; }
    @Override protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/pos/v1/") || request.getRequestURI().startsWith("/api/pos/v1/auth/tokens");
    }
    @Override protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        String header=req.getHeader("Authorization");
        String raw=null;
        if(header!=null){
            String normalized=header.trim();
            if(normalized.regionMatches(true,0,"Bearer ",0,7)) raw=normalized.substring(7).trim();
        }
        var token=tokens.authenticate(raw);
        var tenant=TenantHolder.get();
        if(token.isEmpty()) { fail(res,401,"invalid_api_token"); return; }
        if(tenant==null || tenant.controlPlane() || tenant.vendorId()==null || !java.util.Objects.equals(tenant.vendorId(), token.get().vendorId())) { fail(res,403,"tenant_scope_mismatch"); return; }
        var auth=new UsernamePasswordAuthenticationToken(token.get(),null,token.get().scopes().stream().map(s->new SimpleGrantedAuthority("SCOPE_"+s)).toList());
        SecurityContextHolder.getContext().setAuthentication(auth);
        chain.doFilter(req,res);
    }
    private void fail(HttpServletResponse res,int status,String code)throws IOException { res.setStatus(status);res.setContentType(MediaType.APPLICATION_JSON_VALUE);res.getWriter().write(mapper.writeValueAsString(java.util.Map.of("error",code))); }
}
