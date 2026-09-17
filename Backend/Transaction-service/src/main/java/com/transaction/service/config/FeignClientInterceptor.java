package com.transaction.service.config;

import feign.RequestInterceptor;
import feign.RequestTemplate;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@Component
public class FeignClientInterceptor implements RequestInterceptor {
    private static final String AUTHORIZATION_HEADER = "Authorization";

    @Override
    public void apply(RequestTemplate requestTemplate) {

        requestTemplate.header("X-Internal-System-Call", "true");
        System.out.println("✅ Feign Interceptor fired: Added X-Internal-System-Call header to outgoing request");

        ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();

        if (attributes != null) {
            HttpServletRequest request = attributes.getRequest();
            String authHeader = request.getHeader(AUTHORIZATION_HEADER);

            // If the incoming request has a JWT, attach it to the Feign request
            if (authHeader != null) {
                requestTemplate.header(AUTHORIZATION_HEADER, authHeader);
            }

            requestTemplate.header("X-Internal-System-Call", "true");
        }
    }
}

