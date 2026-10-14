Pod::Spec.new do |s|
  s.name = 'StoreProof'
  s.version = '0.1.0'
  s.summary = 'Read-only purchase proofs'
  s.description = 'StoreKit verified purchase proofs for server verification'
  s.license = { :type => 'UNLICENSED' }
  s.author = 'App authors'
  s.homepage = 'https://localhost'
  s.source = { :path => '.' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'StoreKit'
  s.source_files = '**/*.swift'
end
