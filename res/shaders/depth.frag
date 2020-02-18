#version 430 core

in vec4 fragPos;

uniform vec3 lightPos;

void main()
{
    float lightDistance = length(vec3(fragPos) - lightPos);
    
    lightDistance = lightDistance / 350.0f;				// Maps to [0,1]. 350.0 = far plane
    
    gl_FragDepth = lightDistance;
} 